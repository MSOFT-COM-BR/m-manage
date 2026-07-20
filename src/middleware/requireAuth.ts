import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { mAuth } from '../models/mAuth';

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

        return undefined;
    };
}

/**
 * Valida a sessao contra o estado atual do usuario, nao apenas contra a
 * assinatura do JWT. Isso impede que um token emitido antes de uma revogacao
 * continue sendo usado em operacoes administrativas.
 */
export async function requireActiveUser(ctx: any): Promise<JwtPayload | undefined> {
    const jwt = requireAuth(ctx);
    if (!jwt) return undefined;

    const user = await mAuth.findById(jwt.sub).select('roles status tokenVersion');
    if (!user || user.status !== 'active' || user.tokenVersion !== jwt.tokenVersion) {
        ctx.set.status = 401;
        return undefined;
    }

    // A autorizacao usa os papeis atuais do banco, nao uma copia antiga no token.
    const activeJwt: JwtPayload = {
        ...jwt,
        roles: Array.isArray(user.roles) ? user.roles : [],
    };
    ctx.user = activeJwt;
    return activeJwt;
}

/** O papel global `admin` representa o Admin Master neste backend. */
export async function requireMasterAdmin(ctx: any): Promise<JwtPayload | undefined> {
    const user = await requireActiveUser(ctx);
    if (!user) return undefined;

    if (!user.roles.includes('admin')) {
        ctx.set.status = 403;
        return undefined;
    }

    return user;
}
