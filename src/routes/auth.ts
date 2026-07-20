import { Elysia, t } from 'elysia';
import { mAuth } from '../models/mAuth';
import { mLogs } from '../models/mLogs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { requireActiveUser, requireMasterAdmin } from '../middleware/requireAuth';
import { mAppAccess } from '../models/mAppAccess';
import mongoose from 'mongoose';

const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ACCESS_ROLES = new Set(['owner', 'editor', 'viewer']);
const ADMIN_USER_FIELDS = 'name email roles status lastLogin createdAt updatedAt';
const MAX_ADMIN_USER_LIST_SIZE = 50;

const adminUserCreateBody = t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    email: t.String({ minLength: 3, maxLength: 254 }),
    password: t.String({ minLength: 12, maxLength: 128 }),
    appKey: t.String({ minLength: 2, maxLength: 64 }),
    appRole: t.Optional(t.String({ pattern: '^(owner|editor|viewer)$' })),
    // O Elysia limpa propriedades extras; campos sensiveis precisam existir
    // no schema como impossiveis para que tentativas de escalacao falhem.
    role: t.Optional(t.Never()),
    roles: t.Optional(t.Never()),
    status: t.Optional(t.Never()),
}, { additionalProperties: false });

const adminUserUpdateBody = t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    email: t.Optional(t.String({ minLength: 3, maxLength: 254 })),
    password: t.Optional(t.String({ minLength: 12, maxLength: 128 })),
    role: t.Optional(t.Never()),
    roles: t.Optional(t.Never()),
    status: t.Optional(t.Never()),
}, { additionalProperties: false });

const appAccessUpdateBody = t.Object({
    role: t.String({ pattern: '^(owner|editor|viewer)$' }),
}, { additionalProperties: false });

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAppKey(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function toAccessResponse(access: any) {
    return {
        appKey: String(access.appKey),
        role: String(access.role),
        createdAt: access.createdAt,
        updatedAt: access.updatedAt,
    };
}

function toManagedUserResponse(user: any, appAccesses: any[] = []) {
    return {
        id: String(user.id || user._id),
        name: user.name,
        email: user.email,
        status: user.status,
        lastLogin: user.lastLogin || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        appAccesses: appAccesses.map(toAccessResponse),
    };
}

async function loadAccessesByUserId(userIds: any[]): Promise<Map<string, any[]>> {
    if (!userIds.length) return new Map();

    const accesses = await mAppAccess.find({ userId: { $in: userIds } })
        .select('userId appKey role createdAt updatedAt')
        .sort({ appKey: 1 })
        .lean();
    const accessesByUserId = new Map<string, any[]>();

    for (const access of accesses) {
        const userId = String(access.userId);
        const current = accessesByUserId.get(userId) || [];
        current.push(access);
        accessesByUserId.set(userId, current);
    }

    return accessesByUserId;
}

async function writeAdminAudit(admin: any, action: string, details: string, metadata: Record<string, unknown>) {
    try {
        await mLogs.create({
            action,
            details,
            user: admin.email,
            level: 'warning',
            metadata,
        });
    } catch {
        // A operacao principal nao pode ser revertida apenas por falha no log.
    }
}

async function findManagedUser(ctx: any, admin: any, userId: string) {
    if (!mongoose.isValidObjectId(userId)) {
        ctx.set.status = 400;
        return undefined;
    }

    const user = await mAuth.findById(userId).select(ADMIN_USER_FIELDS);
    if (!user) {
        ctx.set.status = 404;
        return undefined;
    }

    if (user.id === admin.sub) {
        ctx.set.status = 403;
        return undefined;
    }

    if (Array.isArray(user.roles) && user.roles.includes('admin')) {
        ctx.set.status = 403;
        return undefined;
    }

    return user;
}

async function listManagedUsers(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const query = String(ctx.query?.q || '').trim().slice(0, 80);
        const requestedLimit = Number.parseInt(String(ctx.query?.limit || ''), 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), MAX_ADMIN_USER_LIST_SIZE)
            : 25;
        const filter: Record<string, any> = { roles: { $nin: ['admin'] } };

        if (query) {
            const safeQuery = new RegExp(escapeRegex(query), 'i');
            filter.$or = [{ name: safeQuery }, { email: safeQuery }];
        }

        const users = await mAuth.find(filter)
            .select(ADMIN_USER_FIELDS)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        const accessesByUserId = await loadAccessesByUserId(users.map((user: any) => user._id));

        return {
            success: true,
            count: users.length,
            data: users.map((user: any) => toManagedUserResponse(
                user,
                accessesByUserId.get(String(user._id)) || [],
            )),
        };
    } catch (error) {
        console.error('Failed to list managed users:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível carregar os usuários.' };
    }
}

async function getManagedUser(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };

        const accessesByUserId = await loadAccessesByUserId([user._id]);
        return {
            success: true,
            user: toManagedUserResponse(user, accessesByUserId.get(String(user._id)) || []),
        };
    } catch (error) {
        console.error('Failed to load managed user:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível carregar o usuário.' };
    }
}

async function updateManagedUser(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };

        const body = ctx.body || {};
        const updates: Record<string, unknown> = {};

        if (body.name !== undefined) {
            const name = String(body.name || '').trim();
            if (!name) {
                ctx.set.status = 400;
                return { success: false, error: 'Nome inválido.' };
            }
            updates.name = name;
        }
        if (body.email !== undefined) {
            const email = String(body.email || '').trim().toLowerCase();
            if (!EMAIL_PATTERN.test(email)) {
                ctx.set.status = 400;
                return { success: false, error: 'E-mail inválido.' };
            }
            updates.email = email;
        }
        if (body.password !== undefined) {
            const password = String(body.password || '');
            if (password.length < 12) {
                ctx.set.status = 400;
                return { success: false, error: 'A senha deve ter ao menos 12 caracteres.' };
            }
            updates.password = await Bun.password.hash(password, { algorithm: 'argon2id' });
        }
        if (!Object.keys(updates).length) {
            ctx.set.status = 400;
            return { success: false, error: 'Nenhum campo atualizável foi informado.' };
        }

        // Qualquer mudanca administrativa encerra sessoes existentes do alvo.
        const updatedUser = await mAuth.findOneAndUpdate({
            _id: user._id,
            roles: { $nin: ['admin'] },
        }, {
            $set: updates,
            $inc: { tokenVersion: 1 },
            $unset: { refreshToken: 1 },
        }, { new: true, runValidators: true }).select(ADMIN_USER_FIELDS);

        if (!updatedUser) {
            ctx.set.status = 403;
            return { success: false, error: 'Usuário não disponível para gestão.' };
        }

        await writeAdminAudit(
            admin,
            'UPDATE_APP_USER',
            `Conta ${updatedUser.email} atualizada pelo Admin Master.`,
            { userId: updatedUser.id, fields: Object.keys(updates), updatedBy: admin.sub },
        );

        const accessesByUserId = await loadAccessesByUserId([updatedUser._id]);
        return {
            success: true,
            message: 'Usuário atualizado e sessões anteriores invalidadas.',
            user: toManagedUserResponse(updatedUser, accessesByUserId.get(String(updatedUser._id)) || []),
        };
    } catch (error: any) {
        if (error?.code === 11000) {
            ctx.set.status = 409;
            return { success: false, error: 'E-mail já cadastrado.' };
        }
        console.error('Failed to update managed user:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível atualizar o usuário.' };
    }
}

async function reactivateManagedUser(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };
        if (user.status !== 'inactive') {
            ctx.set.status = 409;
            return { success: false, error: 'O usuário já está ativo.' };
        }

        // Contas reativadas nunca recuperam permissões antigas automaticamente.
        await mAppAccess.deleteMany({ userId: user._id });
        const updatedUser = await mAuth.findOneAndUpdate(
            { _id: user._id, roles: { $nin: ['admin'] }, status: 'inactive' },
            {
                $set: { status: 'active' },
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 },
            },
            { new: true, runValidators: true },
        ).select(ADMIN_USER_FIELDS);

        if (!updatedUser) {
            ctx.set.status = 409;
            return { success: false, error: 'Não foi possível reativar este usuário.' };
        }

        await writeAdminAudit(
            admin,
            'REACTIVATE_APP_USER',
            `Conta ${updatedUser.email} reativada sem permissões de aplicação.`,
            { userId: updatedUser.id, reactivatedBy: admin.sub },
        );

        return {
            success: true,
            message: 'Usuário reativado sem acessos. Conceda as permissões necessárias.',
            user: toManagedUserResponse(updatedUser),
        };
    } catch (error) {
        console.error('Failed to reactivate managed user:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível reativar o usuário.' };
    }
}

async function setManagedUserAccess(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };
        if (user.status !== 'active') {
            ctx.set.status = 409;
            return { success: false, error: 'Reative o usuário antes de conceder novos acessos.' };
        }

        const appKey = normalizeAppKey(ctx.params.appKey);
        const role = String(ctx.body?.role || '');
        if (!APP_KEY_PATTERN.test(appKey) || !APP_ACCESS_ROLES.has(role)) {
            ctx.set.status = 400;
            return { success: false, error: 'Aplicação ou permissão inválida.' };
        }

        const access = await mAppAccess.findOneAndUpdate(
            { userId: user._id, appKey },
            {
                $set: { role, grantedBy: admin.sub },
                $setOnInsert: { userId: user._id, appKey },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
        );

        await writeAdminAudit(
            admin,
            'SET_APP_USER_ACCESS',
            `Acesso ${role} definido para ${user.email} em ${appKey}.`,
            { userId: user.id, appKey, role, grantedBy: admin.sub },
        );

        return { success: true, access: toAccessResponse(access) };
    } catch (error) {
        console.error('Failed to set managed user access:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível atualizar o acesso da aplicação.' };
    }
}

async function revokeManagedUserAccess(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };

        const appKey = normalizeAppKey(ctx.params.appKey);
        if (!APP_KEY_PATTERN.test(appKey)) {
            ctx.set.status = 400;
            return { success: false, error: 'Aplicação inválida.' };
        }

        const deleted = await mAppAccess.findOneAndDelete({ userId: user._id, appKey });
        if (!deleted) {
            ctx.set.status = 404;
            return { success: false, error: 'Acesso não encontrado.' };
        }

        await writeAdminAudit(
            admin,
            'REVOKE_APP_USER_ACCESS',
            `Acesso revogado para ${user.email} em ${appKey}.`,
            { userId: user.id, appKey, revokedBy: admin.sub },
        );

        return { success: true, message: 'Acesso revogado.' };
    } catch (error) {
        console.error('Failed to revoke managed user access:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível revogar o acesso da aplicação.' };
    }
}

async function deactivateManagedUser(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado' };

    try {
        const user = await findManagedUser(ctx, admin, ctx.params.id);
        if (!user) return { success: false, error: 'Usuário não disponível para gestão.' };

        if (user.status !== 'inactive') {
            const deactivatedUser = await mAuth.findOneAndUpdate({
                _id: user._id,
                roles: { $nin: ['admin'] },
            }, {
                $set: { status: 'inactive' },
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 },
            }, { runValidators: true });

            if (!deactivatedUser) {
                ctx.set.status = 403;
                return { success: false, error: 'Usuário não disponível para gestão.' };
            }
        }

        let revokedAccesses = 0;
        try {
            const revoked = await mAppAccess.deleteMany({ userId: user._id });
            revokedAccesses = revoked.deletedCount || 0;
        } catch (error) {
            await writeAdminAudit(
                admin,
                'DEACTIVATE_APP_USER_PARTIAL',
                `Conta ${user.email} desativada, mas a revogação de acessos falhou.`,
                { userId: user.id, deactivatedBy: admin.sub },
            );
            ctx.set.status = 500;
            return { success: false, error: 'Conta desativada, mas não foi possível revogar todos os acessos. Tente novamente.' };
        }

        await writeAdminAudit(
            admin,
            'DEACTIVATE_APP_USER',
            `Conta ${user.email} desativada e acessos revogados.`,
            { userId: user.id, revokedAccesses, deactivatedBy: admin.sub },
        );

        return { success: true, message: 'Usuário desativado e acessos revogados.', revokedAccesses };
    } catch (error) {
        console.error('Failed to deactivate managed user:', error);
        ctx.set.status = 500;
        return { success: false, error: 'Não foi possível desativar o usuário.' };
    }
}

export const authRoutes = new Elysia({ prefix: '/auth' })

    .get('/', () => ({
        success: true,
        message: 'Auth Service Ready',
        endpoints: ['/login', '/register', '/refresh', '/logout', '/me', '/admin/users']
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
        } catch (error) {
            console.error('Failed to list application keys:', error);
            ctx.set.status = 500;
            return { success: false, error: 'Não foi possível carregar as aplicações.' };
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
    }, { body: adminUserCreateBody })

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

    // CRUD de contas de aplicacao. As rotas legadas /users usam o mesmo
    // handler seguro, mas nao podem alterar papeis globais nem contas admin.
    .get('/admin/users', listManagedUsers)
    .get('/users', listManagedUsers)
    .get('/admin/users/:id', getManagedUser)
    .put('/admin/users/:id', updateManagedUser, { body: adminUserUpdateBody })
    .put('/users/:id', updateManagedUser, { body: adminUserUpdateBody })
    .post('/admin/users/:id/reactivate', reactivateManagedUser)
    .put('/admin/users/:id/access/:appKey', setManagedUserAccess, { body: appAccessUpdateBody })
    .delete('/admin/users/:id/access/:appKey', revokeManagedUserAccess)
    .delete('/admin/users/:id', deactivateManagedUser);
