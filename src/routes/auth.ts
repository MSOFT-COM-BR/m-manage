import { Elysia, t } from 'elysia';
import { mAuth } from '../models/mAuth';
import { mLogs } from '../models/mLogs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { requireAuth } from '../middleware/requireAuth';
import { mAppAccess } from '../models/mAppAccess';

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

    // Register
    .post('/register', async ({ body, set }: any) => {
        try {
            const existing = await mAuth.findOne({ email: body.email });
            if (existing) {
                set.status = 409;
                return { success: false, error: 'Email já cadastrado' };
            }

            const roles = Array.isArray(body.roles) ? body.roles
                : body.role ? [body.role]
                : ['user'];

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

            // Auto-grant viewer em bva para todos os usuários novos
            try {
                const appRole = roles.includes('reseller') || roles.includes('editor') ? 'editor' : 'viewer';
                await mAppAccess.create({
                    userId: newUser.id,
                    appKey: 'bva',
                    role: appRole,
                    grantedBy: newUser.id,
                });
            } catch (_) { /* ignora se já existir */ }

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

    // Me — retorna usuário logado
    .get('/me', async ({ headers, set }: any) => {
        try {
            const auth = headers?.authorization;
            if (!auth?.startsWith('Bearer ')) {
                set.status = 401;
                return { success: false, error: 'Não autenticado' };
            }
            const { verifyAccessToken } = await import('../config/jwt');
            const payload = verifyAccessToken(auth.slice(7));
            const user = await mAuth.findById(payload.sub);
            if (!user) {
                set.status = 404;
                return { success: false, error: 'Usuário não encontrado' };
            }
            return { success: true, user: user.toJSON() };
        } catch {
            set.status = 401;
            return { success: false, error: 'Token inválido ou expirado' };
        }
    })

    // List users (Admin)
    .get('/users', async () => {
        const users = await mAuth.find().sort({ createdAt: -1 });
        return { success: true, count: users.length, data: users };
    })

    // Update User (Admin)
    .put('/users/:id', async ({ params, body, set }: any) => {
        try {
            if (body.password === '') delete body.password;
            if (body.password) {
                body.password = await Bun.password.hash(body.password, { algorithm: 'argon2id' });
            }
            if (typeof body.roles === 'string') {
                body.roles = body.roles.split(',').map((r: string) => r.trim());
            }

            const updatedUser = await mAuth.findByIdAndUpdate(params.id, body, { new: true });
            if (!updatedUser) {
                set.status = 404;
                return { success: false, error: 'Usuário não encontrado' };
            }

            try {
                await mLogs.create({
                    action: 'UPDATE_USER',
                    details: `User updated: ${updatedUser.email}`,
                    user: 'admin',
                    level: 'warning'
                });
            } catch {}

            return { success: true, message: 'Usuário atualizado', user: updatedUser };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
