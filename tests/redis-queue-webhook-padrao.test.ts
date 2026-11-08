/**
 * Test Suite Ponta a Ponta: Fila Redis + Endpoint de Ingestão + Gerenciador de Tokens + Webhook n8n
 *
 * Módulo: Padrão Engenharia Integration & Asynchronous Messaging Architecture
 * Versão: 0.10.62
 *
 * Cobertura de cenários:
 * 1. Enfileiramento e consumo da fila Redis com RedisQueueService (FIFO, DLQ, JSON serialization)
 * 2. Ingestão HTTP POST /client/form/padrao-engenharia com resposta 202 Accepted e eventId
 * 3. Gerenciamento de ciclo de vida de API Tokens (generateToken, validateToken, revokeToken, escopos e expiração)
 * 4. Assinatura criptográfica HMAC SHA-256 e despacho de Webhook resiliente simulando n8n
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { createHmac } from 'node:crypto';
import { app } from '../src/app';
import { RedisQueueService, redisQueue } from '../src/services/redisQueue.service';
import { TokenService, hashToken, matchesScope } from '../src/modules/tokens/token.service';
import { mApiToken } from '../src/models/mApiToken';
import { WebhookService } from '../src/modules/webhooks/webhook.service';
import { mWebhook } from '../src/models/mWebhook';

describe('Integração Padrão Engenharia - Redis Queue, Endpoint HTTP, Tokens e Webhook n8n (V0.10.62)', () => {

    /* ========================================================================= */
    /* SUÍTE 1: REDIS QUEUE SERVICE (ENFILEIRAMENTO & CONSUMO)                    */
    /* ========================================================================= */
    describe('1. RedisQueueService - Enfileiramento e Consumo Assíncrono', () => {
        let inMemoryStorage: Map<string, string[]>;
        let mockRedisClient: any;
        let queueService: RedisQueueService;

        beforeEach(() => {
            inMemoryStorage = new Map();

            mockRedisClient = {
                status: 'ready',
                connect: async () => {},
                rpush: async (queue: string, item: string) => {
                    const list = inMemoryStorage.get(queue) || [];
                    list.push(item);
                    inMemoryStorage.set(queue, list);
                    return list.length;
                },
                lpop: async (queue: string) => {
                    const list = inMemoryStorage.get(queue) || [];
                    const item = list.shift() || null;
                    inMemoryStorage.set(queue, list);
                    return item;
                },
                llen: async (queue: string) => {
                    return (inMemoryStorage.get(queue) || []).length;
                },
                del: async (queue: string) => {
                    inMemoryStorage.delete(queue);
                    return 1;
                },
            };

            queueService = new RedisQueueService(mockRedisClient);
        });

        it('deve enfileirar com sucesso um evento estruturado de lead e retornar seu identificador único', async () => {
            const queueName = 'queue:client-forms-test';
            const leadEvent = {
                eventId: 'evt-padrao-1001',
                eventType: 'client.form.submitted',
                eventVersion: 1,
                occurredAt: new Date().toISOString(),
                source: 'padrao-engenharia',
                lead: {
                    name: 'Carlos Eduardo Miranda',
                    phone: '11988887777',
                    message: 'Terreno: ja_tenho\nProjeto: ja_tenho\nFinanciamento: financiado\nInício: 3 meses',
                },
                consent: {
                    granted: true,
                    textVersion: 'v1.0',
                },
            };

            const messageId = await queueService.enqueue(queueName, leadEvent);

            expect(messageId).toBe('evt-padrao-1001');
            const queueLength = await queueService.length(queueName);
            expect(queueLength).toBe(1);
        });

        it('deve desenfileirar e deserializar com precisão o payload mantendo a ordem FIFO', async () => {
            const queueName = 'queue:client-forms-fifo';
            const item1 = { id: 'msg-1', name: 'Primeiro Contato' };
            const item2 = { id: 'msg-2', name: 'Segundo Contato' };

            await queueService.enqueue(queueName, item1);
            await queueService.enqueue(queueName, item2);

            const dequeued1 = await queueService.dequeue<typeof item1>(queueName);
            expect(dequeued1).toEqual(item1);

            const dequeued2 = await queueService.dequeue<typeof item2>(queueName);
            expect(dequeued2).toEqual(item2);

            const dequeuedEmpty = await queueService.dequeue(queueName);
            expect(dequeuedEmpty).toBeNull();

            const finalLength = await queueService.length(queueName);
            expect(finalLength).toBe(0);
        });

        it('deve falhar de modo defensivo caso o nome da fila seja inválido', async () => {
            expect(queueService.enqueue('', { data: 'teste' })).rejects.toThrow(
                /Nome da fila é obrigatório/i
            );
        });
    });

    /* ========================================================================= */
    /* SUÍTE 2: ENDPOINT HTTP POST /client/form/padrao-engenharia                 */
    /* ========================================================================= */
    describe('2. Ingestão HTTP POST /client/form/padrao-engenharia', () => {
        let enqueueSpy: any;

        beforeEach(() => {
            // Intercepta a fila Redis global para isolar os testes HTTP
            enqueueSpy = spyOn(redisQueue, 'enqueue').mockImplementation(async () => 1);
        });

        afterEach(() => {
            enqueueSpy.mockRestore();
        });

        it('deve receber lead com sucesso e responder HTTP 202 Accepted com eventId', async () => {
            const payload = {
                name: 'Mariana Padrão Costa',
                phone: '11976543210',
                email: 'mariana.costa@example.com',
                message: 'Terreno: ja_tenho\nProjeto arquitetônico: nao_tenho\nFinanciamento: financiado\nInício previsto: 6 meses',
                consent: true,
            };

            const response = await app.handle(
                new Request('http://localhost:3000/client/form/padrao-engenharia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
            );

            expect(response.status).toBe(202);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.message).toMatch(/recebida com sucesso/i);
            expect(typeof result.eventId).toBe('string');
            expect(result.eventId.length).toBeGreaterThan(10);

            // Valida se o evento foi despachado para a fila Redis com contrato canônico
            expect(enqueueSpy).toHaveBeenCalledTimes(1);
            const [queueName, enqueuedEvent] = enqueueSpy.mock.calls[0];
            expect(queueName).toBe('queue:client-forms');
            expect(enqueuedEvent.source).toBe('padrao-engenharia');
            expect(enqueuedEvent.lead.name).toBe('Mariana Padrão Costa');
            expect(enqueuedEvent.lead.phone).toBe('11976543210');
            expect(enqueuedEvent.lead.email).toBe('mariana.costa@example.com');
            expect(enqueuedEvent.consent.granted).toBe(true);
        });

        it('deve aceitar lead válido sem o campo opcional de e-mail', async () => {
            const payload = {
                name: 'Julio Cesar Engenharia',
                phone: '+55 11 98888-7777',
                message: 'Terreno: nao_tenho\nProjeto arquitetônico: nao_tenho\nFinanciamento: recurso_proprio\nInício previsto: 2 meses',
                consent: true,
            };

            const response = await app.handle(
                new Request('http://localhost:3000/client/form/padrao-engenharia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
            );

            expect(response.status).toBe(202);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.eventId).toBeDefined();

            const [, enqueuedEvent] = enqueueSpy.mock.calls[0];
            expect(enqueuedEvent.lead.email).toBeUndefined();
        });

        it('deve rejeitar submissão com HTTP 400 ou 422 quando consent for falso ou ausente', async () => {
            const payloadSemConsent = {
                name: 'Carlos Miranda',
                phone: '11999998888',
                message: 'Informações da obra',
                consent: false,
            };

            const response = await app.handle(
                new Request('http://localhost:3000/client/form/padrao-engenharia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadSemConsent),
                })
            );

            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(500);
            expect(enqueueSpy).not.toHaveBeenCalled();
        });

        it('deve rejeitar submissão quando campos obrigatórios estiverem malformatados', async () => {
            const payloadInvalido = {
                name: 'A', // Nome curto demais (< 2 caracteres)
                phone: '123', // Telefone curto demais (< 8 caracteres)
                message: '',
                consent: true,
            };

            const response = await app.handle(
                new Request('http://localhost:3000/client/form/padrao-engenharia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadInvalido),
                })
            );

            expect(response.status).toBe(400);
            expect(enqueueSpy).not.toHaveBeenCalled();
        });
    });

    /* ========================================================================= */
    /* SUÍTE 3: GERENCIADOR DE TOKENS (TokenService)                             */
    /* ========================================================================= */
    describe('3. TokenService - Ciclo de Vida de API Tokens & Zero Trust', () => {
        let tokenService: TokenService;
        let mockTokenStorage: Map<string, any>;
        let createSpy: any;
        let findOneSpy: any;
        let findByIdAndUpdateSpy: any;
        let updateOneSpy: any;

        beforeEach(() => {
            tokenService = new TokenService();
            mockTokenStorage = new Map();

            createSpy = spyOn(mApiToken, 'create').mockImplementation(async (data: any) => {
                const id = `token_id_${Date.now()}_${Math.random()}`;
                const doc = {
                    _id: id,
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                mockTokenStorage.set(id, doc);
                mockTokenStorage.set(data.tokenHash, doc);
                return doc;
            });

            findOneSpy = spyOn(mApiToken, 'findOne').mockImplementation((filter: any) => {
                if (filter.tokenHash && filter.status === 'active') {
                    const found = mockTokenStorage.get(filter.tokenHash);
                    if (found && found.status === 'active') {
                        return Promise.resolve(found);
                    }
                }
                return Promise.resolve(null);
            });

            findByIdAndUpdateSpy = spyOn(mApiToken, 'findByIdAndUpdate').mockImplementation(async (id: any, update: any) => {
                const doc = mockTokenStorage.get(String(id));
                if (!doc) return null;
                if (update.$set) {
                    Object.assign(doc, update.$set);
                }
                return doc;
            });

            updateOneSpy = spyOn(mApiToken, 'updateOne').mockImplementation(async () => ({ acknowledged: true }));
        });

        afterEach(() => {
            createSpy.mockRestore();
            findOneSpy.mockRestore();
            findByIdAndUpdateSpy.mockRestore();
            updateOneSpy.mockRestore();
        });

        it('deve gerar token criptograficamente seguro com prefixo e persistir apenas o hash SHA-256', async () => {
            const tokenResponse = await tokenService.generateToken(
                'Integração n8n Padrão Engenharia',
                ['webhooks:dispatch', 'leads:write'],
                'admin_master_1',
                30 // expira em 30 dias
            );

            expect(tokenResponse.token).toMatch(/^mgt_live_[a-f0-9]{48}$/);
            expect(tokenResponse.record.prefix).toBe('mgt_live_');
            expect(tokenResponse.record.name).toBe('Integração n8n Padrão Engenharia');
            expect(tokenResponse.record.scopes).toEqual(['webhooks:dispatch', 'leads:write']);

            // Garante que o banco nunca armazene o token bruto, apenas o hash SHA-256
            const expectedHash = hashToken(tokenResponse.token);
            expect(tokenResponse.record.tokenHash).toBe(expectedHash);
            expect(tokenResponse.record.tokenHash).not.toBe(tokenResponse.token);
        });

        it('deve validar com sucesso um token ativo com os escopos autorizados', async () => {
            const { token } = await tokenService.generateToken(
                'Integração Ativa n8n',
                ['webhooks:dispatch', 'webhooks:*'],
                'admin_master_2'
            );

            const validation = await tokenService.validateToken(token, 'webhooks:dispatch');
            expect(validation.valid).toBe(true);
            expect(validation.tokenDoc).toBeDefined();
            expect(validation.tokenDoc?.name).toBe('Integração Ativa n8n');
        });

        it('deve rejeitar validação quando o escopo exigido não for coberto pelo token', async () => {
            const { token } = await tokenService.generateToken(
                'Token Apenas Leitura',
                ['leads:read'],
                'admin_master_3'
            );

            const validation = await tokenService.validateToken(token, 'webhooks:dispatch');
            expect(validation.valid).toBe(false);
            expect(validation.reason).toBe('INSUFFICIENT_SCOPE');
        });

        it('deve rejeitar token expirado', async () => {
            const { token, record } = await tokenService.generateToken(
                'Token Expirado',
                ['webhooks:dispatch'],
                'admin_master_4'
            );

            // Simula expiração no passado
            record.expiresAt = new Date(Date.now() - 1000 * 60 * 60);

            const validation = await tokenService.validateToken(token, 'webhooks:dispatch');
            expect(validation.valid).toBe(false);
            expect(validation.reason).toBe('TOKEN_EXPIRED');
        });

        it('deve revogar o token com sucesso e impedir utilizações posteriores', async () => {
            const { token, record } = await tokenService.generateToken(
                'Token para Revogação',
                ['webhooks:dispatch'],
                'admin_master_5'
            );

            const isRevoked = await tokenService.revokeToken(String(record._id));
            expect(isRevoked).toBe(true);

            // Nova validação deve falhar imediatamente
            const validationAfterRevoke = await tokenService.validateToken(token, 'webhooks:dispatch');
            expect(validationAfterRevoke.valid).toBe(false);
            expect(validationAfterRevoke.reason).toBe('TOKEN_NOT_FOUND_OR_REVOKED');
        });

        it('deve avaliar corretamente escopos simples, wildcards e prefixos', () => {
            expect(matchesScope(['*'], 'qualquer:coisa')).toBe(true);
            expect(matchesScope(['webhooks:*'], 'webhooks:dispatch')).toBe(true);
            expect(matchesScope(['webhooks:*'], 'webhooks:read')).toBe(true);
            expect(matchesScope(['webhooks:*'], 'leads:write')).toBe(false);
            expect(matchesScope(['leads:write', 'leads:read'], 'leads:write')).toBe(true);
            expect(matchesScope(['leads:read'], 'leads:write')).toBe(false);
        });
    });

    /* ========================================================================= */
    /* SUÍTE 4: WEBHOOK DISPATCH COM ASSINATURA HMAC SHA-256 (n8n SIMULATION)   */
    /* ========================================================================= */
    describe('4. WebhookService - Assinatura HMAC e Despacho para n8n', () => {
        let webhookService: WebhookService;
        let originalFetch: typeof globalThis.fetch;
        let interceptedRequests: { url: string; options: RequestInit }[];
        let findWebhooksSpy: any;

        beforeEach(() => {
            webhookService = new WebhookService();
            interceptedRequests = [];
            originalFetch = globalThis.fetch;

            // Intercepta requisições HTTP de saída disparadas pelo WebhookService
            globalThis.fetch = (async (input: any, init?: RequestInit) => {
                interceptedRequests.push({
                    url: typeof input === 'string' ? input : input.url,
                    options: init || {},
                });

                return new Response(JSON.stringify({ received: true, status: 'ok' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }) as typeof globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
            if (findWebhooksSpy) findWebhooksSpy.mockRestore();
        });

        it('deve despachar evento assinado via HMAC SHA-256 com cabeçalhos canônicos para endpoint n8n', async () => {
            const sharedSecret = 'n8n_super_secret_signing_key_9988';
            const targetUrl = 'https://n8n.mirandasoft.com.br/webhook/leads-padrao-engenharia';

            const simulatedWebhookDoc = {
                _id: 'webhook_n8n_01',
                name: 'n8n Webhook Pipeline Padrão Engenharia',
                url: targetUrl,
                events: ['client.form.submitted'],
                status: 'active',
                secret: sharedSecret,
                headers: {
                    'X-Custom-System': 'MirandaSoft-Manage',
                },
                failureCount: 0,
                save: async () => {},
            };

            findWebhooksSpy = spyOn(mWebhook, 'find').mockResolvedValue([simulatedWebhookDoc] as any);

            const leadEventPayload = {
                eventId: 'lead-evt-9901',
                eventType: 'client.form.submitted',
                source: 'padrao-engenharia',
                lead: {
                    name: 'Lucas Fernando',
                    phone: '11987654321',
                    message: 'Solicitação de orçamento com projeto existente',
                },
                occurredAt: '2026-11-08T13:45:00.000Z',
            };

            const dispatchSummary = await webhookService.dispatch('client.form.submitted', leadEventPayload);

            expect(dispatchSummary.dispatchedCount).toBe(1);
            expect(dispatchSummary.results[0].success).toBe(true);
            expect(dispatchSummary.results[0].status).toBe(200);

            // Verificação rigorosa da requisição recebida pelo n8n
            expect(interceptedRequests.length).toBe(1);
            const request = interceptedRequests[0];
            expect(request.url).toBe(targetUrl);
            expect(request.options.method).toBe('POST');

            const headers = request.options.headers as Record<string, string>;
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['X-Webhook-Event']).toBe('client.form.submitted');
            expect(headers['X-Webhook-Delivery-Id']).toBeDefined();
            expect(headers['X-Webhook-Timestamp']).toBeDefined();
            expect(headers['X-Custom-System']).toBe('MirandaSoft-Manage');

            // Validação matemática da assinatura HMAC SHA-256
            const sentBodyString = String(request.options.body);
            const expectedSignature = `sha256=${createHmac('sha256', sharedSecret).update(sentBodyString).digest('hex')}`;
            expect(headers['X-Webhook-Signature']).toBe(expectedSignature);

            // Validação de que o corpo enviado contém integralmente os dados do lead
            const parsedBody = JSON.parse(sentBodyString);
            expect(parsedBody.eventId).toBe('lead-evt-9901');
            expect(parsedBody.lead.name).toBe('Lucas Fernando');
        });

        it('deve tolerar falhas de rede do n8n de forma graciosa sem interromper o serviço', async () => {
            const simulatedWebhookDoc = {
                _id: 'webhook_n8n_failing',
                name: 'n8n Endpoint Offline',
                url: 'https://n8n.mirandasoft.com.br/webhook/offline-route',
                events: ['*'],
                status: 'active',
                secret: 'any_secret',
                failureCount: 0,
                save: async () => {},
            };

            findWebhooksSpy = spyOn(mWebhook, 'find').mockResolvedValue([simulatedWebhookDoc] as any);

            // Simula erro de conexão/timeout HTTP
            globalThis.fetch = (async () => {
                throw new Error('Connection refused / ECONNREFUSED');
            }) as typeof globalThis.fetch;

            const dispatchSummary = await webhookService.dispatch('client.form.submitted', {
                name: 'Contato em Falha de Rede',
            });

            expect(dispatchSummary.dispatchedCount).toBe(1);
            expect(dispatchSummary.results[0].success).toBe(false);
            expect(dispatchSummary.results[0].error).toMatch(/ECONNREFUSED/i);
        });
    });
});
