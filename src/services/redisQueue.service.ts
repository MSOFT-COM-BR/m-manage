import Redis, { type RedisOptions } from 'ioredis';
import { redis as defaultRedis } from '../config/redis';

export interface ConsumeOptions {
    batchSize?: number;
    pollingIntervalMs?: number;
    concurrency?: number;
    blockTimeoutSeconds?: number;
    maxRetries?: number;
    baseBackoffMs?: number;
    dlqSuffix?: string;
}

export interface QueueJob<T = unknown> {
    id: string;
    queue: string;
    data: T;
    enqueuedAt: string;
}

/**
 * Utilitário de delay assíncrono para backoff e polling
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * RedisQueueService
 *
 * Engine de filas assíncronas baseado em Redis (RPUSH / BLPOP) para substituir RabbitMQ.
 * Projetado para suportar alto throughput, resiliência a falhas, backoff exponencial,
 * dead-letter queues (DLQ) e graceful shutdown sem bloquear o event loop.
 */
export class RedisQueueService {
    private producerClient?: Redis;
    private consumerClients: Set<Redis> = new Set();
    private activeConsumerLoops: Set<() => Promise<void>> = new Set();
    private isClosing = false;
    private connectionUrl: string;

    constructor(customRedis?: Redis) {
        this.connectionUrl = process.env.REDIS_URL || 'redis://localhost:6380';
        if (customRedis) {
            this.producerClient = customRedis;
        }
    }

    private getProducer(): Redis {
        if (!this.producerClient) {
            this.producerClient = defaultRedis;
        }
        return this.producerClient;
    }

    /**
     * Garante que uma instância do Redis esteja conectada caso utilize lazyConnect
     */
    private async ensureConnected(client: Redis): Promise<void> {
        if (client.status === 'wait') {
            await client.connect().catch((err) => {
                console.warn('[RedisQueueService] Conexão em lazyConnect falhou ou pendente:', err.message);
            });
        }
    }

    /**
     * Cria um cliente Redis dedicado exclusivamente para operações bloqueantes (BLPOP/BRPOP)
     * para não prender o pool de comandos do produtor nem interferir no cache global.
     */
    private createDedicatedConsumerClient(): Redis {
        const options: RedisOptions = {
            maxRetriesPerRequest: null, // Obrigatório para comandos bloqueantes BLPOP/BRPOP no ioredis
            enableOfflineQueue: true,
            lazyConnect: true,
            retryStrategy: (times) => {
                if (this.isClosing) return null;
                return Math.min(times * 300, 3000);
            },
        };

        const client = new Redis(this.connectionUrl, options);

        client.on('error', (err) => {
            if (!this.isClosing) {
                console.warn(`[RedisQueueService Consumer Error]: ${err.message}`);
            }
        });

        this.consumerClients.add(client);
        return client;
    }

    /**
     * Enfileira uma mensagem na fila especificada (RPUSH - FIFO).
     *
     * @param queueName Nome da fila (ex: 'queue:client-forms')
     * @param data Objeto ou payload tipado
     * @returns ID da mensagem gerada/identificada
     */
    async enqueue<T>(queueName: string, data: T): Promise<string> {
        if (!queueName || typeof queueName !== 'string') {
            throw new Error('[RedisQueueService] Nome da fila é obrigatório');
        }

        const rawId = (data as any)?.eventId || (data as any)?.id || crypto.randomUUID();
        const messageId = String(rawId);

        const serialized = typeof data === 'string' ? data : JSON.stringify(data);

        const producer = this.getProducer();
        await this.ensureConnected(producer);
        await producer.rpush(queueName, serialized);

        return messageId;
    }

    /**
     * Desenfileira uma mensagem de forma não-bloqueante (LPOP).
     */
    async dequeue<T>(queueName: string): Promise<T | null> {
        const producer = this.getProducer();
        await this.ensureConnected(producer);
        const raw = await producer.lpop(queueName);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return raw as unknown as T;
        }
    }

    /**
     * Retorna a quantidade de itens na fila (LLEN).
     */
    async length(queueName: string): Promise<number> {
        const producer = this.getProducer();
        await this.ensureConnected(producer);
        return await producer.llen(queueName);
    }

    /**
     * Executa o processamento do handler com retry exponencial e fallback para DLQ.
     */
    private async processWithRetry<T>(
        queueName: string,
        payload: T,
        rawPayload: string,
        handler: (data: T) => Promise<void>,
        options?: ConsumeOptions
    ): Promise<void> {
        const maxRetries = options?.maxRetries ?? 3;
        const baseBackoffMs = options?.baseBackoffMs ?? 400;
        const dlqName = `${queueName}${options?.dlqSuffix ?? ':dlq'}`;

        let attempt = 0;
        while (attempt <= maxRetries) {
            try {
                await handler(payload);
                return;
            } catch (error) {
                attempt++;
                console.error(
                    `[RedisQueueService] Erro ao processar mensagem na fila '${queueName}' (tentativa ${attempt}/${maxRetries + 1}):`,
                    error instanceof Error ? error.message : error
                );

                if (attempt <= maxRetries && !this.isClosing) {
                    const delayMs = baseBackoffMs * Math.pow(2, attempt - 1);
                    await sleep(delayMs);
                } else {
                    // Esgotou tentativas: deposita na Dead Letter Queue (DLQ)
                    console.warn(`[RedisQueueService] Movendo mensagem para DLQ '${dlqName}' após ${attempt} falhas.`);
                    try {
                        const dlqRecord = {
                            queue: queueName,
                            failedAt: new Date().toISOString(),
                            attempts: attempt,
                            error: error instanceof Error ? error.message : String(error),
                            rawPayload,
                        };
                        await this.getProducer().rpush(dlqName, JSON.stringify(dlqRecord));
                    } catch (dlqErr) {
                        console.error(`[RedisQueueService] Erro crítico ao gravar na DLQ '${dlqName}':`, dlqErr);
                    }
                    return;
                }
            }
        }
    }

    /**
     * Inicia o consumo assíncrono contínuo da fila com controle de concorrência,
     * timeout bloqueante seguro e graceful backoff.
     *
     * A função inicializa o consumidor em background e retorna imediatamente para não bloquear a subida da API.
     *
     * @param queueName Nome da fila
     * @param handler Função que processa os dados recebidos
     * @param options Configurações adicionais de consumo
     */
    async consume<T>(
        queueName: string,
        handler: (data: T) => Promise<void>,
        options?: ConsumeOptions
    ): Promise<void> {
        if (!queueName || typeof queueName !== 'string') {
            throw new Error('[RedisQueueService] Nome da fila é obrigatório para consumo');
        }

        const consumerClient = this.createDedicatedConsumerClient();
        await this.ensureConnected(consumerClient);

        let isActive = true;
        const batchSize = Math.max(1, options?.batchSize ?? 1);
        const pollingIntervalMs = options?.pollingIntervalMs ?? 0;
        const blockTimeout = Math.max(1, options?.blockTimeoutSeconds ?? 2);
        const concurrency = Math.max(1, options?.concurrency ?? 1);

        const stopConsumer = async () => {
            isActive = false;
        };
        this.activeConsumerLoops.add(stopConsumer);

        // Dispara o loop assíncrono em background sem bloquear o caller
        (async () => {
            while (!this.isClosing && isActive) {
                try {
                    // BLPOP com timeout seguro (2s) para permitir que o loop detecte shutdown sem prender indefinidamente
                    const blpopResult = await consumerClient.blpop(queueName, blockTimeout);

                    if (!blpopResult || !blpopResult[1]) {
                        if (pollingIntervalMs > 0) {
                            await sleep(pollingIntervalMs);
                        }
                        continue;
                    }

                    const rawItems: string[] = [blpopResult[1]];

                    // Se batchSize > 1, drena itens adicionais da fila sem bloquear
                    if (batchSize > 1) {
                        const additionalItems = await consumerClient.lpop(queueName, batchSize - 1);
                        if (Array.isArray(additionalItems)) {
                            rawItems.push(...additionalItems);
                        } else if (additionalItems) {
                            rawItems.push(additionalItems);
                        }
                    }

                    // Processamento dos itens respeitando concorrência
                    const processItem = async (rawItem: string) => {
                        let parsed: T;
                        try {
                            parsed = JSON.parse(rawItem) as T;
                        } catch {
                            parsed = rawItem as unknown as T;
                        }

                        await this.processWithRetry(queueName, parsed, rawItem, handler, options);
                    };

                    if (concurrency > 1 && rawItems.length > 1) {
                        const chunks: string[][] = [];
                        for (let i = 0; i < rawItems.length; i += concurrency) {
                            chunks.push(rawItems.slice(i, i + concurrency));
                        }
                        for (const chunk of chunks) {
                            if (this.isClosing || !isActive) break;
                            await Promise.all(chunk.map((item) => processItem(item)));
                        }
                    } else {
                        for (const item of rawItems) {
                            if (this.isClosing || !isActive) break;
                            await processItem(item);
                        }
                    }

                    if (pollingIntervalMs > 0) {
                        await sleep(pollingIntervalMs);
                    }
                } catch (loopError) {
                    if (this.isClosing || !isActive) break;
                    console.error(`[RedisQueueService] Erro no loop de consumo da fila '${queueName}':`, loopError);
                    // Backoff preventivo para não queimar CPU caso o Redis desconecte
                    await sleep(1000);
                }
            }
        })().catch((unhandled) => {
            console.error(`[RedisQueueService] Exceção não tratada no loop do worker '${queueName}':`, unhandled);
        });

        console.info(`[RedisQueueService] Consumidor registrado com sucesso na fila '${queueName}'.`);
    }

    /**
     * Encerra graciosamente todos os loops de consumo e as conexões de clientes Redis associados.
     */
    async close(): Promise<void> {
        this.isClosing = true;

        // Sinaliza parada de todos os loops ativos
        const stopTasks = Array.from(this.activeConsumerLoops).map((stop) => stop());
        await Promise.allSettled(stopTasks);
        this.activeConsumerLoops.clear();

        // Encerra clientes dedicados de consumo
        const clientCloseTasks = Array.from(this.consumerClients).map(async (client) => {
            try {
                await client.quit();
            } catch {
                client.disconnect();
            }
        });
        await Promise.allSettled(clientCloseTasks);
        this.consumerClients.clear();

        console.info('[RedisQueueService] Todos os consumidores e conexões de fila foram encerrados graciosamente.');
    }
}

export const redisQueue = new RedisQueueService();
