import { createHmac, randomUUID } from 'crypto';
import { mWebhook, type IMWebhook } from '../../models/mWebhook';

export interface WebhookDispatchResult {
    webhookId: string;
    name: string;
    url: string;
    success: boolean;
    status: number;
    latencyMs: number;
    deliveryId: string;
    error?: string;
}

export interface WebhookDispatchSummary {
    dispatchedCount: number;
    results: WebhookDispatchResult[];
}

export interface WebhookTestResult {
    success: boolean;
    status: number;
    latencyMs: number;
    deliveryId: string;
    responseBody?: string;
    error?: string;
}

/**
 * WebhookService
 *
 * Gerencia o registro, assinatura criptográfica (HMAC SHA-256), disparo resiliente
 * com circuit breaker e entrega de eventos para ecossistemas externos (ex: n8n, Zapier, Make).
 */
export class WebhookService {
    private static readonly REQUEST_TIMEOUT_MS = 8000;
    private static readonly MAX_CONSECUTIVE_FAILURES = 10;

    /**
     * Dispara um evento para todos os webhooks ativos inscritos no evento informado.
     *
     * @param event Nome do evento (ex: 'client.form.submitted', 'lead.created')
     * @param payload Objeto de dados a ser enviado no corpo da requisição POST
     */
    async dispatch(event: string, payload: any): Promise<WebhookDispatchSummary> {
        try {
            const webhooks = await mWebhook.find({
                status: 'active',
                $or: [
                    { events: event },
                    { events: '*' }
                ]
            });

            if (!webhooks || webhooks.length === 0) {
                return { dispatchedCount: 0, results: [] };
            }

            const deliveryPromises = webhooks.map((webhook) =>
                this.deliver(webhook, event, payload)
            );

            const settled = await Promise.allSettled(deliveryPromises);
            const results: WebhookDispatchResult[] = [];

            for (let i = 0; i < settled.length; i++) {
                const item = settled[i];
                if (item.status === 'fulfilled') {
                    results.push(item.value);
                } else {
                    const fallbackWebhook = webhooks[i];
                    results.push({
                        webhookId: String(fallbackWebhook._id),
                        name: fallbackWebhook.name,
                        url: fallbackWebhook.url,
                        success: false,
                        status: 0,
                        latencyMs: 0,
                        deliveryId: 'unknown',
                        error: item.reason instanceof Error ? item.reason.message : 'Falha inesperada no delivery'
                    });
                }
            }

            return {
                dispatchedCount: results.length,
                results
            };
        } catch (error: unknown) {
            console.error('[WebhookService] Erro defensivo ao executar dispatch:', error);
            return {
                dispatchedCount: 0,
                results: []
            };
        }
    }

    /**
     * Executa um disparo de teste simulado para validação de conectividade com n8n ou automação.
     *
     * @param webhookId Identificador único do webhook
     * @param testPayload Carga útil customizada opcional para teste
     */
    async testWebhook(webhookId: string, testPayload?: any): Promise<WebhookTestResult> {
        const webhook = await mWebhook.findById(webhookId);
        if (!webhook) {
            throw new Error(`Webhook não encontrado com ID: ${webhookId}`);
        }

        const testEvent = 'webhook.test';
        const samplePayload = {
            test: true,
            ping: 'pong',
            timestamp: new Date().toISOString(),
            webhookId: String(webhook._id),
            webhookName: webhook.name,
            subscribedEvents: webhook.events,
            sampleData: testPayload || {
                message: 'Teste de conexão efetuado pelo MirandaSoft Hub para n8n',
                source: 'm-manage:webhook.service'
            }
        };

        const delivery = await this.deliver(webhook, testEvent, samplePayload, true);

        return {
            success: delivery.success,
            status: delivery.status,
            latencyMs: delivery.latencyMs,
            deliveryId: delivery.deliveryId,
            error: delivery.error
        };
    }

    /**
     * Executa a entrega individual HTTP POST com assinatura HMAC e timeout defensivo.
     */
    private async deliver(
        webhook: IMWebhook,
        event: string,
        payload: any,
        isTestRun: boolean = false
    ): Promise<WebhookDispatchResult> {
        const deliveryId = randomUUID();
        const timestamp = new Date().toISOString();
        const startTime = Date.now();

        const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'MirandaSoft-Webhook-Dispatcher/1.0',
            'X-Webhook-Event': event,
            'X-Webhook-Delivery-Id': deliveryId,
            'X-Webhook-Timestamp': timestamp
        };

        // Assinatura HMAC SHA-256 se o segredo estiver configurado
        if (webhook.secret && webhook.secret.trim().length > 0) {
            const hmac = createHmac('sha256', webhook.secret.trim());
            hmac.update(bodyString);
            const signature = hmac.digest('hex');
            requestHeaders['X-Webhook-Signature'] = `sha256=${signature}`;
        }

        // Incorpora headers customizados configurados pelo usuário
        if (webhook.headers) {
            if (webhook.headers instanceof Map) {
                for (const [key, value] of webhook.headers.entries()) {
                    requestHeaders[key] = String(value);
                }
            } else if (typeof webhook.headers === 'object') {
                for (const [key, value] of Object.entries(webhook.headers)) {
                    requestHeaders[key] = String(value);
                }
            }
        }

        let status = 0;
        let isSuccess = false;
        let errorMessage: string | undefined;

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: requestHeaders,
                body: bodyString,
                signal: AbortSignal.timeout(WebhookService.REQUEST_TIMEOUT_MS)
            });

            status = response.status;
            isSuccess = response.ok;

            if (!isSuccess) {
                errorMessage = `HTTP error status ${response.status}: ${response.statusText}`;
            }
        } catch (error: unknown) {
            isSuccess = false;
            status = 0;
            if (error instanceof Error) {
                errorMessage = error.name === 'TimeoutError'
                    ? `Timeout de ${WebhookService.REQUEST_TIMEOUT_MS}ms excedido ao entregar para ${webhook.url}`
                    : error.message;
            } else {
                errorMessage = 'Falha desconhecida na requisição HTTP';
            }
        }

        const latencyMs = Date.now() - startTime;

        // Atualização de métricas e status com Circuit Breaker (somente em execuções de produção)
        if (!isTestRun) {
            try {
                const updatePayload: Record<string, any> = {
                    lastDispatchedAt: new Date(),
                    lastResponseStatus: status
                };

                if (isSuccess) {
                    updatePayload.failureCount = 0;
                } else {
                    const nextFailureCount = (webhook.failureCount || 0) + 1;
                    updatePayload.failureCount = nextFailureCount;

                    // Circuit Breaker: pausa webhook após falhas consecutivas
                    if (nextFailureCount >= WebhookService.MAX_CONSECUTIVE_FAILURES) {
                        updatePayload.status = 'paused';
                        console.warn(
                            `[WebhookService] Circuit breaker acionado para "${webhook.name}" (${webhook.url}). ` +
                            `Status pausado após ${nextFailureCount} falhas consecutivas.`
                        );
                    }
                }

                await mWebhook.findByIdAndUpdate(webhook._id, updatePayload);
            } catch (dbError: unknown) {
                console.error(`[WebhookService] Erro ao persistir telemetria do webhook ${webhook._id}:`, dbError);
            }
        }

        return {
            webhookId: String(webhook._id),
            name: webhook.name,
            url: webhook.url,
            success: isSuccess,
            status,
            latencyMs,
            deliveryId,
            ...(errorMessage ? { error: errorMessage } : {})
        };
    }
}

export const webhookService = new WebhookService();
