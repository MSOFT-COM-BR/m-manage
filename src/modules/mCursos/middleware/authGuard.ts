import { Elysia } from 'elysia';
import { requireActiveUser } from '../../../middleware/requireAuth';

export const mCursosAuth = (app: Elysia) =>
    app
        .derive(async (ctx: any) => {
            const user = await requireActiveUser(ctx);
            return { user: user ? { ...user, id: user.sub } : undefined };
        })
        .onBeforeHandle(({ user, set }: any) => {
            if (!user) {
                set.status = 401;
                return { success: false, error: 'Não autorizado' };
            }
        });
