import { Elysia } from 'elysia';
import { mCredential } from '../models/mCredential';
import { requireAuth } from '../middleware/requireAuth';

export const credentialRoutes = new Elysia({ prefix: '/credentials' })
    /**
     * GET /credentials - Lista os registros do usuário autenticado
     */
    .get(
        '/',
        async (ctx: any) => {
            const jwt = requireAuth(ctx);
            if (!jwt) return { success: false, error: 'Não autorizado' };

            try {
                const { page = '1', limit = '10' } = ctx.query as any;
                const pageNum = parseInt(page);
                const limitNum = parseInt(limit);
                const skip = (pageNum - 1) * limitNum;

                // Sempre filtra pelo dono identificado via JWT, nunca por parâmetro do cliente
                const filter: any = { userId: jwt.sub, deletedAt: null };

                const [items, total] = await Promise.all([
                    mCredential.find(filter)
                        .limit(limitNum)
                        .skip(skip)
                        .sort({ createdAt: -1 }),
                    mCredential.countDocuments(filter),
                ]);

                return {
                    success: true,
                    data: items,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        totalPages: Math.ceil(total / limitNum),
                    },
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao buscar credentials',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Lista credentials do usuário autenticado',
                tags: ['Credentials'],
            },
        }
    )

    /**
     * GET /credentials/:id - Busca por ID, restrito ao dono do registro
     */
    .get(
        '/:id',
        async (ctx: any) => {
            const jwt = requireAuth(ctx);
            if (!jwt) return { success: false, error: 'Não autorizado' };

            try {
                const item = await mCredential.findOne({ _id: ctx.params.id, userId: jwt.sub, deletedAt: null });

                if (!item) {
                    ctx.set.status = 404;
                    return {
                        success: false,
                        error: 'Credential não encontrada',
                    };
                }

                return {
                    success: true,
                    data: item,
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'ID inválido',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Busca credential por ID (somente do dono)',
                tags: ['Credentials'],
            },
        }
    )

    /**
     * POST /credentials - Cria novo registro para o usuário autenticado
     */
    .post(
        '/',
        async (ctx: any) => {
            const jwt = requireAuth(ctx);
            if (!jwt) return { success: false, error: 'Não autorizado' };

            try {
                // userId sempre vem do JWT, nunca do body enviado pelo cliente
                const newItem = new mCredential({ ...(ctx.body as any), userId: jwt.sub, deletedAt: null });
                await newItem.save();

                ctx.set.status = 201;
                return {
                    success: true,
                    message: 'Credential criada com sucesso',
                    data: newItem,
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao criar credential',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Cria nova credential para o usuário autenticado',
                tags: ['Credentials'],
            },
        }
    )

    /**
     * PUT /credentials/:id - Atualiza registro do usuário autenticado
     */
    .put(
        '/:id',
        async (ctx: any) => {
            const jwt = requireAuth(ctx);
            if (!jwt) return { success: false, error: 'Não autorizado' };

            try {
                // Remove qualquer tentativa de sobrescrever o dono ou o soft-delete do registro
                const { userId: _ignoredUserId, deletedAt: _ignoredDeletedAt, ...updateBody } = (ctx.body as any) ?? {};

                const item = await mCredential.findOneAndUpdate(
                    { _id: ctx.params.id, userId: jwt.sub, deletedAt: null },
                    { $set: updateBody },
                    { new: true }
                );

                if (!item) {
                    ctx.set.status = 404;
                    return {
                        success: false,
                        error: 'Credential não encontrada',
                    };
                }

                return {
                    success: true,
                    message: 'Credential atualizada com sucesso',
                    data: item,
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao atualizar credential',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Atualiza credential (somente do dono)',
                tags: ['Credentials'],
            },
        }
    )

    /**
     * DELETE /credentials/:id - Soft delete do registro do usuário autenticado
     */
    .delete(
        '/:id',
        async (ctx: any) => {
            const jwt = requireAuth(ctx);
            if (!jwt) return { success: false, error: 'Não autorizado' };

            try {
                const item = await mCredential.findOneAndUpdate(
                    { _id: ctx.params.id, userId: jwt.sub, deletedAt: null },
                    { $set: { deletedAt: new Date() } },
                    { new: true }
                );

                if (!item) {
                    ctx.set.status = 404;
                    return {
                        success: false,
                        error: 'Credential não encontrada',
                    };
                }

                return {
                    success: true,
                    message: 'Credential removida com sucesso',
                };
            } catch (error: any) {
                ctx.set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao remover credential',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Remove credential (soft delete, somente do dono)',
                tags: ['Credentials'],
            },
        }
    );
