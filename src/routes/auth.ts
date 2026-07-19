import { Elysia, t } from 'elysia';
import { mAuth } from '../models/mAuth';
import { mLogs } from '../models/mLogs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { requireActiveUser, requireMasterAdmin } from '../middleware/requireAuth';
import { mAppAccess } from '../models/mAppAccess';

const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ACCESS_ROLES = new Set(['owner', 'editor', 'viewer']);
const USER_ROLES = new Set(['admin', 'user', 'premium']);

export const authRoutes = new Elysia({ prefix: '/auth' })

    .get('/', () => ({
        success: true,
        message: 'Auth Service Ready',
        endpoints: ['/login', '/register', '/refresh', '/logout', '/me', '/users']
    }))

    // Login — retorna JWT access + refresh token
    .post('/login', async ({ body, set }: any) => {
        try {
            const { email, password } = body;

            const user = await mAuth.findOne({
                $or: [{ email }, { name: email }]
            }).select('+password +refreshToken +tokenVersion');

            if (!user) {
                set.status = 401;
                return { success: false, error: 'Credenciais inválidas' };
            }

            if (user.status === 'inactive') {
                set.status = 403;
                return { success: false, error: 'Conta desativada' };
            }

            // Verifica senha — suporta argon2 (novo) e plaintext (legado)
            let valid = false;
            if (user.password) {
                try {
                    valid = await Bun.password.verify(password, user.password);
                } catch {
                    // fallback plaintext para contas legadas
                    valid = user.password === password;
                }
            }

            if (!valid) {
                set.status = 401;
                return { success: false, error: 'Credenciais inválidas' };
            }

            const accessToken = signAccessToken({
                sub: user.id,
                email: user.email,
                roles: user.roles,
                tokenVersion: user.tokenVersion,
            });

            const refreshToken = signRefreshToken({
                sub: user.id,
                tokenVersion: user.tokenVersion,
            });

            user.lastLogin = new Date();
            user.refreshToken = refreshToken;
            await user.save();

            try {
                await mLogs.create({
                    action: 'LOGIN',
                    details: `Login: ${user.email}`,
                    user: user.email,
                    level: 'info'
                });
            } catch {}

            set.status = 200;
            return {
                success: true,
                token: accessToken,
                refreshToken,
                user: user.toJSON(),
            };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            email: t.String(),
            password: t.String()
        })
    })

    // Cadastro publico sempre cria uma conta comum. Papeis e acessos sao
    // concedidos exclusivamente pelo fluxo administrativo autenticado.
    .post('/register', async ({ body, set }: any) => {
        try {
            const existing = await mAuth.findOne({ email: body.email });
            if (existing) {
                set.status = 409;
                return { success: false, error: 'Email já cadastrado' };
            }

            const roles = ['user'];

            const hashedPassword = await Bun.password.hash(body.password, { algorithm: 'argon2id' });

            const newUser = await mAuth.create({
                name: body.name,
                email: body.email,
                password: hashedPassword,
                roles,
                provider: 'local',
            });

            const accessToken = signAccessToken({
                sub: newUser.id,
                email: newUser.email,
                roles: newUser.roles,
                tokenVersion: newUser.tokenVersion,
            });

            const refreshToken = signRefreshToken({
                sub: newUser.id,
                tokenVersion: newUser.tokenVersion,
            });

            newUser.refreshToken = refreshToken;
            await newUser.save();

            set.status = 201;
            return {
                success: true,
                message: 'Usuário cadastrado com sucesso',
                token: accessToken,
                refreshToken,
                user: newUser.toJSON(),
            };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({
            name: t.String(),
            email: t.String(),
            password: t.String(),
            role: t.Optional(t.String()),
            roles: t.Optional(t.Array(t.String()))
        })
    })

    // Chaves ja usadas no controle de acesso. O campo continua livre para que
    // o Admin Master consiga provisionar a primeira conta de uma nova app.
    .get('/admin/applications', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        try {
            const appKeys = await mAppAccess.distinct('appKey');
            const data = [...new Set(appKeys
                .map((appKey) => String(appKey || '').trim().toLowerCase())
                .filter((appKey) => APP_KEY_PATTERN.test(appKey)))]
                .sort()
                .map((appKey) => ({ appKey }));

            return { success: true, data };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Cria uma conta comum e concede o primeiro acesso a uma aplicacao. Este
    // endpoint nunca aceita papel global do cliente.
    .post('/admin/users', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const { body, set } = ctx;
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const appKey = String(body.appKey || '').trim().toLowerCase();
        const appRole = String(body.appRole || 'viewer');

        if (!name || !EMAIL_PATTERN.test(email) || password.length < 12 || !APP_KEY_PATTERN.test(appKey) || !APP_ACCESS_ROLES.has(appRole)) {
            set.status = 400;
            return { success: false, error: 'Informe nome, e-mail valido, senha de ao menos 12 caracteres, aplicacao e permissao validas.' };
        }

        const existing = await mAuth.findOne({ email });
        if (existing) {
            set.status = 409;
            return { success: false, error: 'E-mail já cadastrado.' };
        }

        let newUser: any;
        try {
            const hashedPassword = await Bun.password.hash(password, { algorithm: 'argon2id' });
            newUser = await mAuth.create({
                name,
                email,
                password: hashedPassword,
                roles: ['user'],
                provider: 'local',
                status: 'active',
            });

            const access = await mAppAccess.create({
                userId: newUser.id,
                appKey,
                role: appRole,
                grantedBy: admin.sub,
            });

            try {
                await mLogs.create({
                    action: 'CREATE_APP_USER',
                    details: `Conta ${email} criada para ${appKey} com papel ${appRole}.`,
                    user: admin.email,
                    level: 'warning',
                    metadata: { userId: newUser.id, appKey, appRole, grantedBy: admin.sub },
                });
            } catch {
                // A criacao ja foi concluida; falha de auditoria nao pode gerar uma conta duplicada.
            }

            set.status = 201;
            return {
                success: true,
                message: 'Usuário criado e acesso concedido.',
                user: newUser.toJSON(),
                access: access.toJSON(),
            };
        } catch (error: any) {
            // Evita deixar uma conta sem acesso caso a gravacao de mAppAccess falhe.
            if (newUser) {
                await mAppAccess.deleteOne({ userId: newUser.id, appKey }).catch(() => undefined);
                await mAuth.findByIdAndDelete(newUser.id).catch(() => undefined);
            }

            if (error?.code === 11000) {
                set.status = 409;
                return { success: false, error: 'E-mail ou acesso já cadastrado.' };
            }

            console.error('Failed to create application user:', error);
            set.status = 500;
            return { success: false, error: 'Não foi possível criar o usuário.' };
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1, maxLength: 120 }),
            email: t.String({ minLength: 3, maxLength: 254 }),
            password: t.String({ minLength: 12, maxLength: 128 }),
            appKey: t.String({ minLength: 2, maxLength: 64 }),
            appRole: t.Optional(t.String({ pattern: '^(owner|editor|viewer)$' })),
        })
    })

    // Refresh token — troca refresh por novo access token
    .post('/refresh', async ({ body, set }: any) => {
        try {
            const { refreshToken } = body;
            if (!refreshToken) {
                set.status = 400;
                return { success: false, error: 'refreshToken obrigatório' };
            }

            let payload: any;
            try {
                payload = verifyRefreshToken(refreshToken);
            } catch {
                set.status = 401;
                return { success: false, error: 'Refresh token inválido ou expirado' };
            }

            const user = await mAuth.findById(payload.sub).select('+refreshToken +tokenVersion');
            if (!user || user.refreshToken !== refreshToken || user.tokenVersion !== payload.tokenVersion) {
                set.status = 401;
                return { success: false, error: 'Refresh token inválido' };
            }

            const accessToken = signAccessToken({
                sub: user.id,
                email: user.email,
                roles: user.roles,
                tokenVersion: user.tokenVersion,
            });

            return { success: true, token: accessToken };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, {
        body: t.Object({ refreshToken: t.String() })
    })

    // Logout — invalida refresh token
    .post('/logout', async ({ headers, set }: any) => {
        try {
            const auth = headers?.authorization;
            if (!auth?.startsWith('Bearer ')) {
                set.status = 401;
                return { success: false, error: 'Não autenticado' };
            }

            // Não verifica o token (pode estar expirado), mas incrementa tokenVersion
            // para invalidar todos os tokens emitidos anteriormente
            const { verifyAccessToken } = await import('../config/jwt');
            let userId: string;
            try {
                const payload = verifyAccessToken(auth.slice(7));
                userId = payload.sub;
            } catch (e: any) {
                // token expirado — ainda faz logout pelo ID embutido
                if (e.name === 'TokenExpiredError') {
                    const decoded = JSON.parse(Buffer.from(auth.slice(7).split('.')[1], 'base64').toString());
                    userId = decoded.sub;
                } else {
                    set.status = 401;
                    return { success: false, error: 'Token inválido' };
                }
            }

            await mAuth.findByIdAndUpdate(userId, {
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 }
            });

            return { success: true, message: 'Logout realizado' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Me — retorna usuario logado e ainda ativo
    .get('/me', async (ctx: any) => {
        try {
            const payload = await requireActiveUser(ctx);
            if (!payload) return { success: false, error: 'Não autenticado' };

            const user = await mAuth.findById(payload.sub);
            if (!user) {
                ctx.set.status = 404;
                return { success: false, error: 'Usuário não encontrado' };
            }
            return { success: true, user: user.toJSON() };
        } catch {
            ctx.set.status = 401;
            return { success: false, error: 'Token inválido ou expirado' };
        }
    })

    // List users (Admin Master)
    .get('/users', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const users = await mAuth.find().sort({ createdAt: -1 });
        return { success: true, count: users.length, data: users };
    })

    // Update User (Admin Master). Apenas campos administrativos explicitos sao aceitos.
    .put('/users/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const { params, set } = ctx;
        const body = ctx.body || {};
        try {
            const updates: Record<string, unknown> = {};
            let invalidateSessions = false;

            if (typeof body.name === 'string' && body.name.trim()) {
                updates.name = body.name.trim();
            }
            if (typeof body.email === 'string' && body.email.trim()) {
                const email = body.email.trim().toLowerCase();
                if (!EMAIL_PATTERN.test(email)) {
                    set.status = 400;
                    return { success: false, error: 'E-mail inválido.' };
                }
                updates.email = email;
            }
            if (typeof body.password === 'string' && body.password) {
                if (body.password.length < 8) {
                    set.status = 400;
                    return { success: false, error: 'A senha deve ter ao menos 8 caracteres.' };
                }
                updates.password = await Bun.password.hash(body.password, { algorithm: 'argon2id' });
                invalidateSessions = true;
            }
            if (body.roles !== undefined) {
                const roles = (Array.isArray(body.roles) ? body.roles : String(body.roles).split(','))
                    .map((role: unknown) => String(role).trim())
                    .filter(Boolean);
                if (!roles.length || roles.some((role: string) => !USER_ROLES.has(role))) {
                    set.status = 400;
                    return { success: false, error: 'Papéis de usuário inválidos.' };
                }
                updates.roles = [...new Set(roles)];
                invalidateSessions = true;
            }
            if (body.status !== undefined) {
                if (body.status !== 'active' && body.status !== 'inactive') {
                    set.status = 400;
                    return { success: false, error: 'Status de usuário inválido.' };
                }
                updates.status = body.status;
                invalidateSessions = true;
            }
            if (typeof body.avatar === 'string') updates.avatar = body.avatar.trim();

            if (!Object.keys(updates).length) {
                set.status = 400;
                return { success: false, error: 'Nenhum campo atualizável foi informado.' };
            }

            const update: Record<string, unknown> = { $set: updates };
            if (invalidateSessions) {
                update.$inc = { tokenVersion: 1 };
                update.$unset = { refreshToken: 1 };
            }

            const updatedUser = await mAuth.findByIdAndUpdate(params.id, update, { new: true, runValidators: true });
            if (!updatedUser) {
                set.status = 404;
                return { success: false, error: 'Usuário não encontrado' };
            }

            try {
                await mLogs.create({
                    action: 'UPDATE_USER',
                    details: `User updated: ${updatedUser.email}`,
                    user: admin.email,
                    level: 'warning'
                });
            } catch {}

            return { success: true, message: 'Usuário atualizado', user: updatedUser.toJSON() };
        } catch (error: any) {
            if (error?.code === 11000) {
                set.status = 409;
                return { success: false, error: 'E-mail já cadastrado.' };
            }
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
