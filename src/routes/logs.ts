import { Elysia, t } from 'elysia';
import { mLogs } from '../models/mLogs';
import { requireAuth } from '../middleware/requireAuth';

export const logRoutes = new Elysia({ prefix: '/logs' })
    // Get recent logs (contém IP/user-agent/ações de usuários: exige sessão)
    .get('/', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
        try {
            const logs = await mLogs.find().sort({ createdAt: -1 }).limit(100);
            return { success: true, count: logs.length, data: logs };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    })

    // Create a log entry (Internal use mainly, but exposed for frontend generic logs if needed)
    .post('/', async ({ body, request }: any) => {
        try {
            const forwardedFor = request.headers.get('x-forwarded-for');
            const realIp = request.headers.get('x-real-ip');
            const derivedIp = (forwardedFor ? String(forwardedFor).split(',')[0].trim() : '') || realIp || 'unknown';
            const userAgent = request.headers.get('user-agent') || 'unknown';

            const newLog = new mLogs({
                ...body,
                ip: body.ip || derivedIp,
                userAgent: body.userAgent || userAgent
            });
            await newLog.save();
            return { success: true, data: newLog };
        } catch (e: any) {
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
