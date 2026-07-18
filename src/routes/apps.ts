import { Elysia, t } from 'elysia';
import { mApps } from '../models/mApps';
import { mAppAccess } from '../models/mAppAccess';
import { requireAuth } from '../middleware/requireAuth';
import { verifyAccessToken } from '../config/jwt';
import mongoose from 'mongoose';

export const appRoutes = new Elysia({ prefix: '/apps' })

    // Lista apps instalados do usuário autenticado.
    // Admin pode consultar qualquer usuário via ?userId=, ou o catálogo inteiro via ?all=1;
    // demais usuários sempre veem apenas os próprios apps, independente do que enviarem na query.
    .get('/', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };

        try {
            const isAdmin = jwt.roles?.includes('admin');

            if (isAdmin && ctx.query.all) {
                const apps = await mApps.find({});
                return { success: true, data: apps };
            }

            const targetUserId = isAdmin && ctx.query.userId ? ctx.query.userId : jwt.sub;
            const apps = await mApps.find({ userId: new mongoose.Types.ObjectId(targetUserId) });
            return { success: true, data: apps };
        } catch (error) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Register/Install an app para o usuário autenticado
    .post('/install', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };

        try {
            const { name, appKey } = ctx.body as { name: string; appKey: string };
            const userId = jwt.sub;

            // Check if already installed
            const existing = await mApps.findOne({ userId: new mongoose.Types.ObjectId(userId), appKey });
            if (existing) {
                return { success: true, data: existing, message: 'App already installed' };
            }

            const newApp = new mApps({
                name,
                appKey,
                userId: new mongoose.Types.ObjectId(userId),
                status: 'active'
            });

            await newApp.save();

            return { success: true, data: newApp, message: 'App installed successfully' };
        } catch (error) {
            ctx.set.status = 500;
            console.error(error);
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            name: t.String(),
            appKey: t.String()
        })
    })

    // Verify App Access using Access Token
    .post('/verify', async ({ body, set }: any) => {
        try {
            const { access_token, appKey } = body;

            // 1. Find User by Access Token
            // Assume Auth model is registered
            const mAuth = mongoose.model('Auth');

            const user = await mAuth.findOne({ access_token });
            if (!user) {
                set.status = 401;
                return { success: false, error: 'Invalid Access Token' };
            }

            // 2. Check if User has App installed and active
            const app = await mApps.findOne({
                userId: user._id,
                appKey: appKey,
                status: 'active'
            });

            if (!app) {
                set.status = 403;
                return { success: false, error: 'Access Denied: App not active or not purchased.' };
            }

            return {
                success: true,
                message: 'Access Granted',
                user: { id: user._id, email: user.email, name: user.name },
                appString: appKey
            };

        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            access_token: t.String(),
            appKey: t.String()
        })
    })

    // Lista apps acessíveis pelo user logado
    .get('/mine', async ({ headers, set }: any) => {
        try {
            const auth = headers?.authorization;
            if (!auth?.startsWith('Bearer ')) {
                set.status = 401;
                return { success: false, error: 'Não autenticado' };
            }
            const payload = verifyAccessToken(auth.slice(7));
            const accesses = await mAppAccess.find({ userId: payload.sub }).sort({ createdAt: -1 });
            return { success: true, count: accesses.length, data: accesses };
        } catch {
            set.status = 401;
            return { success: false, error: 'Token inválido ou expirado' };
        }
    })

    // Concede acesso de um user a uma app (requer admin ou owner)
    .post('/access', async ({ body, headers, set }: any) => {
        try {
            const auth = headers?.authorization;
            if (!auth?.startsWith('Bearer ')) {
                set.status = 401;
                return { success: false, error: 'Não autenticado' };
            }
            const grantor = verifyAccessToken(auth.slice(7));

            const { userId, appKey, role } = body;

            // Só admin ou owner da app pode conceder acesso
            if (!grantor.roles.includes('admin')) {
                const grantorAccess = await mAppAccess.findOne({ userId: grantor.sub, appKey });
                if (!grantorAccess || grantorAccess.role !== 'owner') {
                    set.status = 403;
                    return { success: false, error: 'Apenas admin ou owner pode conceder acesso' };
                }
            }

            const access = await mAppAccess.findOneAndUpdate(
                { userId, appKey },
                { userId, appKey, role: role || 'viewer', grantedBy: grantor.sub },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            return { success: true, data: access };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            userId: t.String(),
            appKey: t.String(),
            role: t.Optional(t.Union([t.Literal('owner'), t.Literal('editor'), t.Literal('viewer')]))
        })
    })

    // Revoga acesso
    .delete('/access/:userId/:appKey', async ({ params, headers, set }: any) => {
        try {
            const auth = headers?.authorization;
            if (!auth?.startsWith('Bearer ')) {
                set.status = 401;
                return { success: false, error: 'Não autenticado' };
            }
            const revoker = verifyAccessToken(auth.slice(7));

            if (!revoker.roles.includes('admin')) {
                const revokerAccess = await mAppAccess.findOne({ userId: revoker.sub, appKey: params.appKey });
                if (!revokerAccess || revokerAccess.role !== 'owner') {
                    set.status = 403;
                    return { success: false, error: 'Apenas admin ou owner pode revogar acesso' };
                }
            }

            const deleted = await mAppAccess.findOneAndDelete({ userId: params.userId, appKey: params.appKey });
            if (!deleted) {
                set.status = 404;
                return { success: false, error: 'Acesso não encontrado' };
            }

            return { success: true, message: 'Acesso revogado' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
