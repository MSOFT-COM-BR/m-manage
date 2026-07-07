import Elysia from 'elysia';
import { mAppAccess, AppAccessRole } from '../models/mAppAccess';
import { verifyAccessToken } from '../config/jwt';
import { mAuth } from '../models/mAuth';

const ROLE_WEIGHT: Record<AppAccessRole, number> = { viewer: 1, editor: 2, owner: 3 };

function hasMinRole(actual: AppAccessRole, min: AppAccessRole) {
    return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[min];
}

export async function checkTenantAccess(ctx: any, minRole: AppAccessRole) {
    const auth = ctx.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) {
        ctx.set.status = 401;
        return { success: false, error: 'Não autenticado' };
    }

    let user: any;
    try {
        user = verifyAccessToken(auth.slice(7));
    } catch {
        ctx.set.status = 401;
        return { success: false, error: 'Token inválido ou expirado' };
    }

    ctx.user = user;

    // Admin global bypass
    if (user.roles?.includes('admin')) return;

    const authUser = await mAuth.findById(user.sub).select('status tokenVersion');
    if (!authUser || authUser.status !== 'active' || authUser.tokenVersion !== user.tokenVersion) {
        ctx.set.status = 403;
        return { success: false, error: 'Conta sem acesso ativo' };
    }

    const appKey = ctx.query?.appKey || ctx.body?.appKey || ctx.params?.appKey;
    if (!appKey) {
        ctx.set.status = 400;
        return { success: false, error: 'appKey obrigatório' };
    }

    const access = await mAppAccess.findOne({ userId: user.sub, appKey });
    if (!access || !hasMinRole(access.role, minRole)) {
        ctx.set.status = 403;
        return { success: false, error: `Sem acesso de '${minRole}' em '${appKey}'` };
    }
}

// Plugin Elysia que adiciona o guard com o scope correto para afetar rotas filhas
export function tenantGuard(minRole: AppAccessRole = 'viewer') {
    return new Elysia({ name: `tenant-guard-${minRole}` })
        .onBeforeHandle({ as: 'scoped' }, (ctx: any) => checkTenantAccess(ctx, minRole));
}
