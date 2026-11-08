import { Elysia, t } from 'elysia';
import { mContent } from '../../models/mContent';
import { requireMasterAdmin } from '../../middleware/requireAuth';

export const contentRoutes = new Elysia({ prefix: '/content' })
    .get('/:key', async ({ params }: any) => {
        try {
            const content = await mContent.findOne({ key: params.key });
            if (!content) {
                return { success: false, error: 'Conteúdo não encontrado' };
            }
            return { success: true, data: content.data };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    })
    .post('/', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) {
            return { success: false, error: 'Não autorizado' };
        }

        try {
            const { key, data } = ctx.body;
            const content = await mContent.findOneAndUpdate(
                { key },
                { data },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return { success: true, data: content };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            key: t.String(),
            data: t.Object({}) // Accepts any object structure
        })
    });
