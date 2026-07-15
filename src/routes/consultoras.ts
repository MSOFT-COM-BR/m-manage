import { Elysia } from 'elysia';
import { mAuth } from '../models/mAuth';
import { requireAuth } from '../middleware/requireAuth';
import { mAppAccess } from '../models/mAppAccess';

function isAdmin(jwt: any) {
    return jwt?.roles?.includes('admin');
}

function generateStrongPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    return pass;
}

function serializeConsultora(user: any, access: any) {
    return {
        id:         String(user._id),
        nome:       user.name,
        email:      user.email,
        whatsapp:   user.whatsapp ?? '',
        instagram:  user.instagram ?? '',
        cidade:     user.cidade ?? '',
        nivel:      user.nivel ?? 'Prata',
        role:       access?.role ?? 'viewer',
        status:     user.status,
        avatar:     user.avatar ?? null,
        lastLogin:  user.lastLogin ?? null,
        createdAt:  user.createdAt,
        blockedAt:  user.blockedAt ?? null,
        restoredAt: user.restoredAt ?? null,
    };
}

export const consultorasRoutes = new Elysia({ prefix: '/bva/consultoras' })

    // GET /bva/consultoras/public — lista pública para seleção de consultora na vitrine
    .get('/public', async () => {
        const accesses = await mAppAccess.find({ appKey: 'bva' }).lean();
        const userIds = accesses.map(a => a.userId);
        const users = await mAuth.find({ _id: { $in: userIds }, status: 'active' }).lean();

        const data = users.map(u => {
            const acc = accesses.find(a => a.userId.toString() === u._id.toString());
            return {
                id: String(u._id),
                name: u.name,
                store: u.nivel ? `${u.name} Studio BVA ${u.nivel}` : `${u.name} Studio BVA`,
                whatsapp: u.whatsapp ?? '',
                email: u.email,
                instagram: u.instagram ?? '',
                role: acc?.role ?? 'viewer',
            };
        });

        return { success: true, data, total: data.length };
    })

    // GET /bva/consultoras?appKey=bva — lista consultoras do tenant BVA
    .get('/', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) { ctx.set.status = 401; return { success: false, error: 'Não autorizado' }; }

        const includeInactive = ctx.query?.includeInactive === '1' && isAdmin(jwt);

        // Busca todos os users com acesso ao appKey bva
        const accesses = await mAppAccess.find({ appKey: 'bva' }).lean();
        const userIds = accesses.map(a => a.userId);

        const filter: Record<string, any> = { _id: { $in: userIds } };
        if (!includeInactive) filter.status = 'active';

        const users = await mAuth.find(filter).sort({ status: 1, name: 1 }).lean();

        const data = users.map(u => {
            const acc = accesses.find(a => a.userId.toString() === u._id.toString());
            return serializeConsultora(u, acc);
        });

        return { success: true, data, total: data.length };
    })

    // POST /bva/consultoras — cria nova consultora (admin)
    .post('/', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt || !isAdmin(jwt)) { ctx.set.status = 403; return { success: false, error: 'Apenas admins podem criar consultoras' }; }

        const { nome, email, whatsapp, instagram, cidade, nivel, role, senha, status } = ctx.body as any;
        if (!nome || !email) { ctx.set.status = 400; return { success: false, error: 'nome e email são obrigatórios' }; }
        const normalizedStatus = status === 'inactive' ? 'inactive' : 'active';

        const senhaFinal = senha || 'bva@2025';
        const password = await Bun.password.hash(senhaFinal, { algorithm: 'argon2id' });

        let user = await mAuth.findOne({ email });
        if (user) { ctx.set.status = 409; return { success: false, error: 'Email já cadastrado' }; }

        user = await mAuth.create({
            name: nome, email, password,
            roles: ['user'],
            status: normalizedStatus,
            whatsapp: whatsapp ?? '',
            instagram: instagram ?? '',
            cidade: cidade ?? '',
            nivel: nivel ?? 'Prata',
            ...(normalizedStatus === 'inactive' ? { blockedAt: new Date() } : {}),
        });

        // Grant no tenant bva
        const appRole = role ?? 'viewer';
        await mAppAccess.create({
            userId: user._id,
            appKey: 'bva',
            role: appRole,
            grantedBy: jwt.sub,
        }).catch(() => {});

        return { success: true, data: serializeConsultora(user, { role: appRole }), senhaGerada: senha ? null : senhaFinal };
    })

    // PATCH /bva/consultoras/:id/reset-password — gera ou define nova senha (admin)
    .patch('/:id/reset-password', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt || !isAdmin(jwt)) { ctx.set.status = 403; return { success: false, error: 'Apenas admins' }; }

        const { senha } = (ctx.body as any) || {};
        const novaSenha = senha || generateStrongPassword();
        const password = await Bun.password.hash(novaSenha, { algorithm: 'argon2id' });

        const user = await mAuth.findByIdAndUpdate(
            ctx.params.id,
            {
                $set: { password },
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 },
            },
            { new: true }
        );
        if (!user) { ctx.set.status = 404; return { success: false, error: 'Consultora não encontrada' }; }

        return { success: true, message: 'Senha redefinida', senha: novaSenha };
    })

    // PUT /bva/consultoras/:id — atualiza dados de uma consultora (admin)
    .put('/:id', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt || !isAdmin(jwt)) { ctx.set.status = 403; return { success: false, error: 'Apenas admins' }; }

        const { nome, whatsapp, instagram, cidade, nivel, role, status } = ctx.body as any;
        const existingUser = await mAuth.findById(ctx.params.id);
        if (!existingUser) { ctx.set.status = 404; return { success: false, error: 'Usuária não encontrada' }; }

        const update: Record<string, any> = {};
        if (nome)      update.name      = nome;
        if (whatsapp  != null) update.whatsapp  = whatsapp;
        if (instagram != null) update.instagram = instagram;
        if (cidade    != null) update.cidade    = cidade;
        if (nivel     != null) update.nivel     = nivel;
        let shouldRevokeTokens = false;
        if (status    != null) {
            const normalizedStatus = status === 'inactive' ? 'inactive' : 'active';
            update.status = normalizedStatus;
            shouldRevokeTokens = existingUser.status !== normalizedStatus;
            if (shouldRevokeTokens) update[normalizedStatus === 'inactive' ? 'blockedAt' : 'restoredAt'] = new Date();
        }

        const updateOps: Record<string, any> = { $set: update };
        if (shouldRevokeTokens) {
            updateOps.$inc = { tokenVersion: 1 };
            updateOps.$unset = { refreshToken: 1 };
        }

        const user = await mAuth.findByIdAndUpdate(ctx.params.id, updateOps, { new: true });

        // Atualiza role no mAppAccess se veio
        if (role) {
            await mAppAccess.findOneAndUpdate(
                { userId: user._id, appKey: 'bva' },
                { $set: { role } },
                { upsert: true }
            );
        }

        const access = await mAppAccess.findOne({ userId: user._id, appKey: 'bva' }).lean();
        return { success: true, data: serializeConsultora(user, access) };
    })

    // DELETE /bva/consultoras/:id — soft delete: bloqueia acesso sem apagar histórico
    .delete('/:id', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt || !isAdmin(jwt)) { ctx.set.status = 403; return { success: false, error: 'Apenas admins' }; }

        const user = await mAuth.findByIdAndUpdate(
            ctx.params.id,
            {
                $set: { status: 'inactive', blockedAt: new Date() },
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 },
            },
            { new: true }
        );
        if (!user) { ctx.set.status = 404; return { success: false, error: 'Consultora não encontrada' }; }

        const access = await mAppAccess.findOne({ userId: user._id, appKey: 'bva' }).lean();

        return { success: true, message: 'Acesso bloqueado', data: serializeConsultora(user, access) };
    })

    // PATCH /bva/consultoras/:id/restore — reativa acesso da consultora (admin)
    .patch('/:id/restore', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt || !isAdmin(jwt)) { ctx.set.status = 403; return { success: false, error: 'Apenas admins' }; }

        const body = ctx.body || {};
        const role = body.role || 'viewer';
        const user = await mAuth.findByIdAndUpdate(
            ctx.params.id,
            {
                $set: { status: 'active', restoredAt: new Date() },
                $inc: { tokenVersion: 1 },
                $unset: { refreshToken: 1 },
            },
            { new: true }
        );
        if (!user) { ctx.set.status = 404; return { success: false, error: 'Consultora não encontrada' }; }

        const access = await mAppAccess.findOneAndUpdate(
            { userId: user._id, appKey: 'bva' },
            { $set: { role, grantedBy: jwt.sub } },
            { upsert: true, new: true }
        );

        return { success: true, message: 'Acesso reativado', data: serializeConsultora(user, access) };
    });
