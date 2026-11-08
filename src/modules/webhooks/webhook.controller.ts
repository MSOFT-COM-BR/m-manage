import { Elysia, t } from 'elysia';
import { Types } from 'mongoose';
import { mWebhook, type WebhookStatus } from '../../models/mWebhook';
import { requireMasterAdmin } from '../../middleware/requireAuth';
import { webhookService } from './webhook.service';

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
};

const isValidHttpUrl = (urlString: string): boolean => {
    try {
        const parsed = new URL(urlString);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const createWebhookBody = t.Object({
    name: t.String({ minLength: 2, maxLength: 150 }),
    url: t.String({ minLength: 8, maxLength: 1000 }),
    events: t.Array(t.String({ minLength: 1, maxLength: 100 }), { minItems: 1 }),
    status: t.Optional(t.Union([t.Literal('active'), t.Literal('paused'), t.Literal('disabled')])),
    secret: t.Optional(t.String({ maxLength: 256 })),
    headers: t.Optional(t.Record(t.String(), t.String()))
});

const updateWebhookBody = t.Object({
    name: t.Optional(t.String({ minLength: 2, maxLength: 150 })),
    url: t.Optional(t.String({ minLength: 8, maxLength: 1000 })),
    events: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 100 }), { minItems: 1 })),
    status: t.Optional(t.Union([t.Literal('active'), t.Literal('paused'), t.Literal('disabled')])),
    secret: t.Optional(t.String({ maxLength: 256 })),
    headers: t.Optional(t.Record(t.String(), t.String())),
    resetFailureCount: t.Optional(t.Boolean())
});

const testWebhookBody = t.Optional(t.Object({
    sampleData: t.Optional(t.Any())
}));

export const webhookRoutes = new Elysia({ prefix: '/webhooks' })
    // Módulo administrativo de Webhooks: restrito exclusivamente a Master Admins
    .onBeforeHandle(async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) {
            return {
                success: false,
                error: ctx.set?.status === 403
                    ? 'Acesso negado: privilégios de Master Admin necessários'
                    : 'Não autorizado'
            };
        }
        return undefined;
    })

    /**
     * GET /webhooks - Lista todos os endpoints de webhook cadastrados
     */
    .get('/', async ({ set }: any) => {
        try {
            const webhooks = await mWebhook.find()
                .sort({ createdAt: -1 })
                .lean();

            return {
                success: true,
                count: webhooks.length,
                data: webhooks
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error, 'Erro ao listar webhooks cadastrados')
            };
        }
    })

    /**
     * POST /webhooks - Cadastra novo webhook (ex: URL do n8n)
     */
    .post('/', async ({ body, set }: any) => {
        try {
            const urlTrimmed = body.url.trim();
            if (!isValidHttpUrl(urlTrimmed)) {
                set.status = 400;
                return {
                    success: false,
                    error: 'URL de webhook inválida. Deve iniciar com http:// ou https://'
                };
            }

            // Normaliza eventos sem duplicatas
            const uniqueEvents = Array.from(new Set(body.events.map((e: string) => e.trim()))).filter(Boolean);

            const newWebhook = await mWebhook.create({
                name: body.name.trim(),
                url: urlTrimmed,
                events: uniqueEvents,
                status: (body.status as WebhookStatus) || 'active',
                secret: body.secret ? body.secret.trim() : undefined,
                headers: body.headers || undefined,
                failureCount: 0
            });

            set.status = 201;
            return {
                success: true,
                message: 'Webhook cadastrado com sucesso',
                data: newWebhook
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error, 'Erro ao cadastrar novo webhook')
            };
        }
    }, {
        body: createWebhookBody
    })

    /**
     * GET /webhooks/:id - Obtém detalhes de um webhook por ID
     */
    .get('/:id', async ({ params, set }: any) => {
        try {
            if (!Types.ObjectId.isValid(params.id)) {
                set.status = 400;
                return { success: false, error: 'Identificador de webhook inválido' };
            }

            const webhook = await mWebhook.findById(params.id).lean();
            if (!webhook) {
                set.status = 404;
                return { success: false, error: 'Webhook não encontrado' };
            }

            return {
                success: true,
                data: webhook
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error, 'Erro ao buscar webhook')
            };
        }
    })

    /**
     * PUT /webhooks/:id - Atualiza URL, eventos, status ou segredo do webhook
     */
    .put('/:id', async ({ params, body, set }: any) => {
        try {
            if (!Types.ObjectId.isValid(params.id)) {
                set.status = 400;
                return { success: false, error: 'Identificador de webhook inválido' };
            }

            const updateData: Record<string, any> = {};

            if (body.name !== undefined) {
                updateData.name = body.name.trim();
            }

            if (body.url !== undefined) {
                const urlTrimmed = body.url.trim();
                if (!isValidHttpUrl(urlTrimmed)) {
                    set.status = 400;
                    return {
                        success: false,
                        error: 'URL de webhook inválida. Deve iniciar com http:// ou https://'
                    };
                }
                updateData.url = urlTrimmed;
            }

            if (body.events !== undefined) {
                updateData.events = Array.from(new Set(body.events.map((e: string) => e.trim()))).filter(Boolean);
            }

            if (body.status !== undefined) {
                updateData.status = body.status;
                // Se reativado, zera o contador de falhas para restabelecer o circuit breaker
                if (body.status === 'active') {
                    updateData.failureCount = 0;
                }
            }

            if (body.secret !== undefined) {
                updateData.secret = body.secret ? body.secret.trim() : undefined;
            }

            if (body.headers !== undefined) {
                updateData.headers = body.headers;
            }

            if (body.resetFailureCount === true) {
                updateData.failureCount = 0;
            }

            const updatedWebhook = await mWebhook.findByIdAndUpdate(
                params.id,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!updatedWebhook) {
                set.status = 404;
                return { success: false, error: 'Webhook não encontrado para atualização' };
            }

            return {
                success: true,
                message: 'Webhook atualizado com sucesso',
                data: updatedWebhook
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error, 'Erro ao atualizar webhook')
            };
        }
    }, {
        body: updateWebhookBody
    })

    /**
     * DELETE /webhooks/:id - Remove um webhook configurado
     */
    .delete('/:id', async ({ params, set }: any) => {
        try {
            if (!Types.ObjectId.isValid(params.id)) {
                set.status = 400;
                return { success: false, error: 'Identificador de webhook inválido' };
            }

            const deleted = await mWebhook.findByIdAndDelete(params.id);
            if (!deleted) {
                set.status = 404;
                return { success: false, error: 'Webhook não encontrado para remoção' };
            }

            return {
                success: true,
                message: 'Webhook removido com sucesso',
                id: params.id
            };
        } catch (error: unknown) {
            set.status = 500;
            return {
                success: false,
                error: getErrorMessage(error, 'Erro ao remover webhook')
            };
        }
    })

    /**
     * POST /webhooks/:id/test - Dispara payload de teste simulado para validar conexão com n8n
     */
    .post('/:id/test', async ({ params, body, set }: any) => {
        try {
            if (!Types.ObjectId.isValid(params.id)) {
                set.status = 400;
                return { success: false, error: 'Identificador de webhook inválido' };
            }

            const result = await webhookService.testWebhook(params.id, body?.sampleData);

            return {
                success: true,
                message: result.success
                    ? 'Disparo de teste executado com sucesso'
                    : 'Disparo de teste concluído com alerta ou erro HTTP',
                data: result
            };
        } catch (error: unknown) {
            const message = getErrorMessage(error, 'Erro ao executar teste de webhook');
            if (message.includes('Webhook não encontrado')) {
                set.status = 404;
            } else {
                set.status = 500;
            }
            return {
                success: false,
                error: message
            };
        }
    }, {
        body: testWebhookBody
    });
