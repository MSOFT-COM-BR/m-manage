import { Elysia, t } from 'elysia';
import { randomUUID } from 'node:crypto';
import { redisQueue } from '../../services/redisQueue.service';

export const CLIENT_FORMS_QUEUE = 'queue:client-forms';

export const clientFormBodySchema = t.Object({
    name: t.String({ minLength: 2, maxLength: 120 }),
    phone: t.String({ minLength: 8, maxLength: 30, pattern: '^[0-9+()\\s-]{8,30}$' }),
    email: t.Optional(t.String({ maxLength: 180, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' })),
    message: t.String({ minLength: 1, maxLength: 3000 }),
    consent: t.Literal(true),
});

export const clientFormParamsSchema = t.Object({
    source: t.String({ minLength: 1, maxLength: 80 }),
});

export type ClientFormSubmittedEvent = {
    eventId: string;
    eventType: 'client.form.submitted';
    eventVersion: 1;
    occurredAt: string;
    source: string;
    lead: {
        name: string;
        phone: string;
        email?: string;
        message: string;
    };
    consent: {
        granted: true;
        textVersion: string;
    };
};

/**
 * Endpoint de Ingestão de Formulários de Clientes (ex: m-padrao-engenharia)
 * Valida o payload recebido, monta o evento padronizado v1 e publica na fila Redis.
 */
export const clientFormsRoutes = new Elysia({ prefix: '/client/form' })
    .post('/:source', async ({ params, body, set }) => {
        try {
            if (body.consent !== true) {
                set.status = 400;
                return {
                    success: false,
                    error: 'Consentimento obrigatório',
                };
            }

            const eventId = randomUUID();
            const occurredAt = new Date().toISOString();

            const event: ClientFormSubmittedEvent = {
                eventId,
                eventType: 'client.form.submitted',
                eventVersion: 1,
                occurredAt,
                source: params.source.trim(),
                lead: {
                    name: body.name.trim(),
                    phone: body.phone.trim(),
                    ...(body.email?.trim() ? { email: body.email.trim().toLowerCase() } : {}),
                    message: body.message.trim(),
                },
                consent: {
                    granted: true,
                    textVersion: 'v1.0',
                },
            };

            await redisQueue.enqueue(CLIENT_FORMS_QUEUE, event);

            set.status = 202;
            return {
                success: true,
                message: 'Solicitação recebida com sucesso',
                eventId,
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro interno ao processar formulário',
            };
        }
    }, {
        params: clientFormParamsSchema,
        body: clientFormBodySchema,
    });
