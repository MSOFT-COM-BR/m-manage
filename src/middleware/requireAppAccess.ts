import { mAppAccess, AppAccessRole } from '../models/mAppAccess';
import { verifyAccessToken } from '../config/jwt';
import { mAuth } from '../models/mAuth';

const ROLE_WEIGHT: Record<AppAccessRole, number> = {
    viewer: 1,
    editor: 2,
    owner: 3,
};

function hasMinRole(actual: AppAccessRole, min: AppAccessRole): boolean {
    return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[min];
}

export function requireAppAccess(minRole: AppAccessRole = 'viewer') {
    return async (ctx: any) => {
        // 1. Verifica JWT
        const auth = ctx.headers?.authorization;
        if (!auth?.startsWith('Bearer ')) {
            ctx.set.status = 401;
            return { success: false, error: 'Não autenticado' };
        }

        let jwtPayload: any;
        try {
            jwtPayload = verifyAccessToken(auth.slice(7));
        } catch {
            ctx.set.status = 401;
            return { success: false, error: 'Token inválido ou expirado' };
        }

        ctx.user = jwtPayload;

        // 2. Admin global bypass
        if (jwtPayload.roles?.includes('admin')) return;

        const user = await mAuth.findById(jwtPayload.sub).select('status tokenVersion');
        if (!user || user.status !== 'active' || user.tokenVersion !== jwtPayload.tokenVersion) {
            ctx.set.status = 403;
            return { success: false, error: 'Conta sem acesso ativo' };
        }

        // 3. Extrai appKey da query ou body
        const appKey = ctx.query?.appKey || ctx.body?.appKey || ctx.params?.appKey;
        if (!appKey) {
            ctx.set.status = 400;
            return { success: false, error: 'appKey obrigatório' };
        }

        // 4. Verifica acesso no banco
        const access = await mAppAccess.findOne({ userId: jwtPayload.sub, appKey });
        if (!access || !hasMinRole(access.role, minRole)) {
            ctx.set.status = 403;
            return { success: false, error: `Sem acesso de '${minRole}' na aplicação '${appKey}'` };
        }
    };
}
