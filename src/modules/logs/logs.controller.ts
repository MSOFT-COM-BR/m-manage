import { Elysia, t } from 'elysia';
import { mLogs } from '../../models/mLogs';
import { requireAuth, requireMasterAdmin } from '../../middleware/requireAuth';

export const logRoutes = new Elysia({ prefix: '/logs' })
    // Get recent logs (contém IP/user-agent/ações de usuários: restrito a Master Admin)
    .get('/', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };
        try {
            const logs = await mLogs.find().sort({ createdAt: -1 }).limit(100);
            return { success: true, count: logs.length, data: logs };
        } catch (e: any) {
            ctx.set.status = 500;
            return { success: false, error: e.message };
        }
    })

    // Create a log entry (Exige autenticação para impedir injeção arbitrária de logs)
    .post('/', async (ctx: any) => {
        const user = requireAuth(ctx);
        if (!user) return { success: false, error: 'Não autorizado' };

        try {
            const { body, request, set } = ctx;
            const forwardedFor = request.headers.get('x-forwarded-for');
            const realIp = request.headers.get('x-real-ip');
            const derivedIp = (forwardedFor ? String(forwardedFor).split(',')[0].trim() : '') || realIp || 'unknown';
            const userAgent = request.headers.get('user-agent') || 'unknown';

            const newLog = new mLogs({
                ...body,
                user: body.user || user.email || user.sub,
                ip: body.ip || derivedIp,
                userAgent: body.userAgent || userAgent
            });
            await newLog.save();
            set.status = 201;
            return { success: true, data: newLog };
        } catch (e: any) {
            ctx.set.status = 500;
            return { success: false, error: e.message };
        }
    }, {
        body: t.Object({
            action: t.String(),
            details: t.String(),
            user: t.Optional(t.String()),
            level: t.Optional(t.String()),
            ip: t.Optional(t.String()),
            userAgent: t.Optional(t.String()),
            path: t.Optional(t.String()),
            metadata: t.Optional(t.Object({}))
        })
    });
