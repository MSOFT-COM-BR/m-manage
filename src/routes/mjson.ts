import { Elysia, t } from 'elysia';
import { mJson } from '../models/mJson';
import { requireAuth } from '../middleware/requireAuth';

const mjsonBody = t.Object({
    key: t.String({ minLength: 2, maxLength: 120 }),
    data: t.Object({}),
    description: t.Optional(t.String({ maxLength: 240 }))
});

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return 'Erro interno no modulo MJSON';
};

export const mjsonRoutes = new Elysia({ prefix: '/mjson' })
    // Módulo de administração de conteúdo (admin.html): exige sessão válida
    .onBeforeHandle((ctx: any) => requireAuth(ctx) ? undefined : { success: false, error: 'Não autorizado' })
    .get('/', async ({ set }) => {
        try {
            const docs = await mJson.find({}, { key: 1, description: 1, updatedAt: 1 }).sort({ updatedAt: -1 });
            return { success: true, data: docs };
        } catch (error: unknown) {
            set.status = 500;
            return { success: false, error: getErrorMessage(error) };
        }
    })
    .get('/:key', async ({ params, set }) => {
        try {
            const doc = await mJson.findOne({ key: params.key });
            if (!doc) {
                set.status = 404;
                return { success: false, error: 'MJSON não encontrado' };
            }
            return { success: true, data: doc };
        } catch (error: unknown) {
            set.status = 500;
            return { success: false, error: getErrorMessage(error) };
        }
    })
    .post('/', async ({ body, set }) => {
        try {
            const doc = await mJson.findOneAndUpdate(
                { key: body.key },
                { data: body.data, description: body.description || '' },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return { success: true, data: doc };
        } catch (error: unknown) {
            set.status = 500;
            return { success: false, error: getErrorMessage(error) };
        }
    }, {
        body: mjsonBody
    });
