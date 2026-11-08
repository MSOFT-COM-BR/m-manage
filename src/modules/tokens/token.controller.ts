import { Elysia, t } from 'elysia';
import { requireMasterAdmin } from '../../middleware/requireAuth';
import { tokenService } from './token.service';

/**
 * Schemas TypeBox para validação estrita de entrada
 */
const createTokenBodySchema = t.Object({
    name: t.String({
        minLength: 2,
        maxLength: 120,
        error: 'O nome do token deve conter entre 2 e 120 caracteres.',
    }),
    scopes: t.Array(t.String({ minLength: 1 }), {
        minItems: 1,
        error: 'Informe ao menos um escopo de permissão (ex: ["webhooks:dispatch"]).',
    }),
    expiresInDays: t.Optional(
        t.Number({
            minimum: 1,
            maximum: 3650,
            error: 'expiresInDays deve ser um número inteiro entre 1 e 3650.',
        })
    ),
});

const verifyTokenBodySchema = t.Object({
    token: t.String({
        minLength: 1,
        error: 'O token é obrigatório para verificação.',
    }),
    requiredScope: t.Optional(
        t.String({
            minLength: 1,
        })
    ),
});

const tokenIdParamSchema = t.Object({
    id: t.String({
        minLength: 1,
        error: 'ID do token é obrigatório.',
    }),
});

/**
 * Controller de Tokens de API Unificados do m-manage.
 * Gerencia ciclo de vida: emissão, listagem, revogação e validação de tokens para
 * webhooks, integrações n8n e automações externas.
 */
export const tokenRoutes = new Elysia({ prefix: '/tokens' })
    /**
     * GET /tokens
     * Lista todos os tokens de API cadastrados (protegido por Master Admin).
     */
    .get(
        '/',
        async (ctx: any) => {
            const admin = await requireMasterAdmin(ctx);
            if (!admin) {
                ctx.set.status = 403;
                return {
                    success: false,
                    error: 'Acesso negado. Apenas administradores Master podem listar tokens de API.',
                };
            }

            try {
                const tokens = await tokenService.listTokens();
                return {
                    success: true,
                    count: tokens.length,
                    data: tokens,
                };
            } catch (error: any) {
                ctx.set.status = 500;
                return {
                    success: false,
                    error: 'Erro interno ao consultar tokens de API.',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Lista todos os API tokens emitidos',
                tags: ['API Tokens'],
            },
        }
    )

    /**
     * POST /tokens
     * Emite um novo token criptográfico (protegido por Master Admin).
     * O token em texto claro é retornado apenas na resposta desta requisição.
     */
    .post(
        '/',
        async (ctx: any) => {
            const admin = await requireMasterAdmin(ctx);
            if (!admin) {
                ctx.set.status = 403;
                return {
                    success: false,
                    error: 'Acesso negado. Apenas administradores Master podem emitir tokens de API.',
                };
            }

            try {
                const { name, scopes, expiresInDays } = ctx.body;
                const createdBy = admin.sub || admin.email || 'admin';

                const result = await tokenService.generateToken(
                    name,
                    scopes,
                    createdBy,
                    expiresInDays
                );

                ctx.set.status = 201;
                return {
                    success: true,
                    message:
                        'Token de API gerado com sucesso. Guarde este valor com segurança agora, pois ele não poderá ser recuperado posteriormente.',
                    data: {
                        token: result.token,
                        record: result.record,
                    },
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Falha ao gerar token de API.',
                    message: error.message,
                };
            }
        },
        {
            body: createTokenBodySchema,
            detail: {
                summary: 'Cria e emite um novo token de API',
                tags: ['API Tokens'],
            },
        }
    )

    /**
     * DELETE /tokens/:id
     * Revoga um token de API existente (protegido por Master Admin).
     */
    .delete(
        '/:id',
        async (ctx: any) => {
            const admin = await requireMasterAdmin(ctx);
            if (!admin) {
                ctx.set.status = 403;
                return {
                    success: false,
                    error: 'Acesso negado. Apenas administradores Master podem revogar tokens de API.',
                };
            }

            try {
                const { id } = ctx.params;
                const revoked = await tokenService.revokeToken(id);

                if (!revoked) {
                    ctx.set.status = 404;
                    return {
                        success: false,
                        error: 'Token não encontrado para revogação.',
                    };
                }

                return {
                    success: true,
                    message: 'Token de API revogado com sucesso.',
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Falha ao revogar token de API.',
                    message: error.message,
                };
            }
        },
        {
            params: tokenIdParamSchema,
            detail: {
                summary: 'Revoga um token de API ativo',
                tags: ['API Tokens'],
            },
        }
    )

    /**
     * POST /tokens/verify
     * Validação operacional rápida de token para automações (n8n, webhooks, microserviços)
     * e auditoria por Master Admin.
     */
    .post(
        '/verify',
        async (ctx: any) => {
            try {
                const { token, requiredScope } = ctx.body;
                const validation = await tokenService.validateToken(token, requiredScope);

                if (!validation.valid || !validation.tokenDoc) {
                    ctx.set.status = 401;
                    return {
                        success: false,
                        valid: false,
                        reason: validation.reason,
                        error: 'Token inválido, expirado, revogado ou com escopo insuficiente.',
                    };
                }

                const doc = validation.tokenDoc;
                return {
                    success: true,
                    valid: true,
                    data: {
                        id: doc._id,
                        name: doc.name,
                        prefix: doc.prefix,
                        scopes: doc.scopes,
                        status: doc.status,
                        expiresAt: doc.expiresAt,
                        lastUsedAt: doc.lastUsedAt,
                    },
                };
            } catch (error: any) {
                ctx.set.status = 500;
                return {
                    success: false,
                    valid: false,
                    error: 'Erro durante a validação do token.',
                    message: error.message,
                };
            }
        },
        {
            body: verifyTokenBodySchema,
            detail: {
                summary: 'Valida se um token é ativo, não-expirado e possui o escopo necessário',
                tags: ['API Tokens'],
            },
        }
    );

/**
 * Rota alias `/api-tokens` apontando para os mesmos endpoints
 */
export const apiTokenRoutes = new Elysia({ prefix: '/api-tokens' })
    .use(tokenRoutes);
