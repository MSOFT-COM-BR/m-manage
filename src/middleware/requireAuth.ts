import { verifyAccessToken, JwtPayload } from '../config/jwt';

export function requireAuth(ctx: any): JwtPayload | undefined {
    const auth = ctx.headers?.authorization || ctx.request?.headers?.get?.('authorization');
    if (!auth?.startsWith('Bearer ')) {
        ctx.set.status = 401;
        ctx.set.headers = { ...ctx.set.headers, 'WWW-Authenticate': 'Bearer' };
        return undefined;
    }
    const token = auth.slice(7);
    try {
        const payload = verifyAccessToken(token);
        ctx.user = payload;
        return payload;
    } catch {
        ctx.set.status = 401;
        return undefined;
    }
}

export function requireRole(...roles: string[]) {
    return (ctx: any) => {
        const user = ctx.user as JwtPayload | undefined;
        if (!user) {
            ctx.set.status = 401;
            return { success: false, error: 'Não autenticado' };
        }
        const hasRole = roles.some(r => user.roles.includes(r));
        if (!hasRole) {
            ctx.set.status = 403;
            return { success: false, error: 'Acesso negado' };
        }
    };
}
