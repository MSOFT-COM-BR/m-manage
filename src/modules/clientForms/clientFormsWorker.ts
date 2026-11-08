import { redisQueue } from '../../services/redisQueue.service';
import { persistClientFormEvent } from './consumer';

export const CLIENT_FORMS_QUEUE = 'queue:client-forms';

/**
 * Processa a mensagem de formulário recebida na fila Redis.
 *
 * 1. Persiste de forma idempotente e segura no MongoDB (coleção ClientForm).
 * 2. Notifica o WebhookService para despachar o evento 'client.form.submitted'
 *    para o ecossistema externo / n8n (Telegram, WhatsApp, CRM).
 */
export async function handleClientFormEvent(event: unknown): Promise<void> {
    const eventId = (event as any)?.eventId || 'desconhecido';
    const source = (event as any)?.source || 'indefinido';

    console.info(`[clientFormsWorker] Processando evento de formulário [${eventId}] da origem [${source}]...`);

    // 1. Salva no MongoDB através da função de domínio já homologada
    await persistClientFormEvent(event);
    console.info(`[clientFormsWorker] Evento [${eventId}] persistido com sucesso no MongoDB.`);

    // 2. Dispara webhook para n8n / integrações externas
    try {
        const { webhookService } = await import('../webhooks/webhook.service');
        if (webhookService && typeof webhookService.dispatch === 'function') {
            const summary = await webhookService.dispatch('client.form.submitted', event);
            console.info(`[clientFormsWorker] Webhooks disparados para evento [${eventId}]:`, {
                totalDespachados: summary.dispatchedCount,
            });
        }
    } catch (webhookError) {
        // Falha no webhook não deve invalidar a persistência do evento no banco
        console.warn(`[clientFormsWorker] Aviso ao disparar webhooks para o evento [${eventId}]:`, webhookError);
    }
}

/**
 * Inicializa o consumidor contínuo da fila Redis de formulários de clientes.
 */
export async function startClientFormsWorker(): Promise<void> {
    console.info(`[clientFormsWorker] Registrando consumidor Redis na fila '${CLIENT_FORMS_QUEUE}'...`);
    await redisQueue.consume(CLIENT_FORMS_QUEUE, handleClientFormEvent, {
        batchSize: 1,
        maxRetries: 3,
        baseBackoffMs: 500,
    });
}
