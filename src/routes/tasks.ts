import { Elysia } from 'elysia';
import { mTask } from '../models/mTask';
import { requireAuth } from '../middleware/requireAuth';

export const taskRoutes = new Elysia({ prefix: '/tasks' })
    // Módulo interno/administrativo: exige sessão válida em todas as rotas
    .onBeforeHandle((ctx: any) => requireAuth(ctx) ? undefined : { success: false, error: 'Não autorizado' })

    /**
     * GET /tasks - Lista todos os registros
     */
    .get(
        '/',
        async ({ query }) => {
            try {
                const { page = '1', limit = '10' } = query as any;
                const pageNum = parseInt(page);
                const limitNum = parseInt(limit);
                const skip = (pageNum - 1) * limitNum;

                const [items, total] = await Promise.all([
                    mTask.find()
                        .limit(limitNum)
                        .skip(skip)
                        .sort({ createdAt: -1 }),
                    mTask.countDocuments(),
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
                return {
                    success: false,
                    error: 'Erro ao buscar tasks',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Lista tasks',
                tags: ['Tasks'],
            },
        }
    )

    /**
     * GET /tasks/:id - Busca por ID
     */
    .get(
        '/:id',
        async ({ params, set }) => {
            try {
                const item = await mTask.findById(params.id);

                if (!item) {
                    set.status = 404;
                    return {
                        success: false,
                        error: 'Task não encontrada',
                    };
                }

                return {
                    success: true,
                    data: item,
                };
            } catch (error: any) {
                set.status = 400;
                return {
                    success: false,
                    error: 'ID inválido',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Busca task por ID',
                tags: ['Tasks'],
            },
        }
    )

    /**
     * POST /tasks - Cria novo registro
     */
    .post(
        '/',
        async ({ body, set }) => {
            try {
                const newItem = new mTask(body);
                await newItem.save();

                set.status = 201;
                return {
                    success: true,
                    message: 'Task criada com sucesso',
                    data: newItem,
                };
            } catch (error: any) {
                set.status = 400;
                return {
                    success: false,
                    error: 'Erro ao criar task',
                    message: error.message,
                };
            }
        },
        {
            detail: {
                summary: 'Cria nova task',
                tags: ['Tasks'],
            },
        }
    );
