import { connectMongo } from '../config/mongo';
import { mAuth } from '../models/mAuth';
import { mAppAccess } from '../models/mAppAccess';

const MONGO_URI = process.env.MONGODB_URI || '';
if (MONGO_URI.includes('+srv') || MONGO_URI.includes('cluster') || process.env.NODE_ENV === 'production') {
    console.error('🚫 Seed bloqueado em produção.');
    process.exit(1);
}

// ─── Usuários de seed ────────────────────────────────────────────────────────

interface SeedUser {
    name: string;
    email: string;
    password: string;
    roles: string[];
    appAccess?: { appKey: string; role: 'owner' | 'editor' | 'viewer' }[];
}

const SEED_USERS: SeedUser[] = [
    {
        name: 'Breno Miranda (Admin)',
        email: 'breno@mmanage.dev',
        password: 'admin123',
        roles: ['admin', 'user'],
        // admin bypassa tenantGuard — não precisa de mAppAccess
    },
    {
        name: 'Demo BVA Admin',
        email: 'admin@bva.dev',
        password: 'bva2026',
        roles: ['user'],
        appAccess: [{ appKey: 'bva', role: 'owner' }],
    },
    {
        name: 'Revendedora BVA',
        email: 'revendedora@bva.dev',
        password: 'rev123',
        roles: ['user'],
        appAccess: [{ appKey: 'bva', role: 'editor' }],
    },
    {
        name: 'Consultora BVA',
        email: 'consultora@bva.dev',
        password: 'cons123',
        roles: ['user'],
        appAccess: [{ appKey: 'bva', role: 'viewer' }],
    },
    {
        name: 'Demo HealthTech',
        email: 'admin@healthtech.dev',
        password: 'health2026',
        roles: ['user'],
        appAccess: [{ appKey: 'healthtech', role: 'owner' }],
    },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

async function seedUsers() {
    await connectMongo();
    console.log('🌱 Seed de usuários iniciado\n');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const u of SEED_USERS) {
        const hashed = await Bun.password.hash(u.password, { algorithm: 'argon2id' });

        const existing = await mAuth.findOne({ email: u.email }).select('+password');

        let userId: string;

        if (existing) {
            existing.name = u.name;
            existing.password = hashed;
            existing.roles = u.roles as any;
            existing.status = 'active';
            existing.tokenVersion = (existing.tokenVersion || 0) + 1; // invalida tokens antigos
            await existing.save();
            userId = existing.id;
            console.log(`  ♻️  Atualizado  ${u.email}  [${u.roles.join(', ')}]`);
            updated++;
        } else {
            const doc = await mAuth.create({
                name: u.name,
                email: u.email,
                password: hashed,
                roles: u.roles,
                status: 'active',
                provider: 'local',
            });
            userId = doc.id;
            console.log(`  ✅ Criado     ${u.email}  [${u.roles.join(', ')}]`);
            created++;
        }

        // Sincroniza mAppAccess
        if (u.appAccess?.length) {
            for (const a of u.appAccess) {
                await mAppAccess.findOneAndUpdate(
                    { userId, appKey: a.appKey },
                    { userId, appKey: a.appKey, role: a.role, grantedBy: userId },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                console.log(`     └─ appAccess: ${a.appKey} → ${a.role}`);
            }
        }
    }

    console.log(`\n─────────────────────────────────────────`);
    console.log(`  Criados: ${created}  |  Atualizados: ${updated}  |  Ignorados: ${skipped}`);
    console.log(`\n📋 Credenciais de acesso:`);
    for (const u of SEED_USERS) {
        const access = u.appAccess?.map(a => `${a.appKey}:${a.role}`).join(', ') || 'admin global';
        console.log(`  ${u.email.padEnd(30)} senha: ${u.password.padEnd(12)} [${access}]`);
    }
    console.log('');

    process.exit(0);
}

seedUsers().catch(err => {
    console.error('❌ Erro no seed:', err.message);
    process.exit(1);
});
