import { Elysia } from 'elysia';
import { mBvaCatalogAccess } from '../models/mBvaCatalogAccess';
import { requireAppAccess } from '../middleware/requireAppAccess';

function sanitizeString(value: unknown, max = 120): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
}

export const bvaCatalogAccessRoutes = new Elysia({ prefix: '/bva/catalog-access' })
    // POST /bva/catalog-access — pública, registra 1 acesso ao catálogo (vitrine)
    .post('/', async (ctx: any) => {
        const body = ctx.body || {};
        await mBvaCatalogAccess.create({
            appKey: sanitizeString(body.appKey, 40) || 'bva',
            resellerId: sanitizeString(body.resellerId, 80),
            resellerName: sanitizeString(body.resellerName, 120),
        });
        ctx.set.status = 201;
        return { success: true };
    })

    // GET /bva/catalog-access/stats?appKey=&resellerId= — viewer+ (contagem total e de hoje)
    .get('/stats', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const query = ctx.query as Record<string, string>;
        const appKey = query.appKey || 'bva';
        const filter: Record<string, any> = { appKey };
        if (query.resellerId) filter.resellerId = query.resellerId;

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const [total, hoje, ontem] = await Promise.all([
            mBvaCatalogAccess.countDocuments(filter),
            mBvaCatalogAccess.countDocuments({ ...filter, createdAt: { $gte: startOfToday } }),
            mBvaCatalogAccess.countDocuments({ ...filter, createdAt: { $gte: startOfYesterday, $lt: startOfToday } }),
        ]);

        const variacaoHoje = ontem > 0 ? Math.round(((hoje - ontem) / ontem) * 100) : (hoje > 0 ? 100 : 0);

        return { success: true, data: { total, hoje, ontem, variacaoHoje } };
    });
