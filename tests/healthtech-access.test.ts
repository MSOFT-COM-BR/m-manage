import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { signAccessToken } from '../src/config/jwt';
import { mAuth } from '../src/models/mAuth';
import { mApps } from '../src/models/mApps';

// Use test database
if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/bun-api-test';
}

describe('HealthTech access control', () => {
    const withAppEmail = `healthtech_with_app_${Date.now()}@msoft.com.br`;
    const withoutAppEmail = `healthtech_without_app_${Date.now()}@msoft.com.br`;
    const adminEmail = `healthtech_admin_${Date.now()}@msoft.com.br`;

    let withAppToken = '';
    let withoutAppToken = '';
    let adminToken = '';

    beforeAll(async () => {
        await db.connect();
        await mAuth.deleteMany({ email: { $in: [withAppEmail, withoutAppEmail, adminEmail] } });

        const [withAppPassword, withoutAppPassword, adminPassword] = await Promise.all([
            Bun.password.hash('with-app-password-123', { algorithm: 'argon2id' }),
            Bun.password.hash('without-app-password-123', { algorithm: 'argon2id' }),
            Bun.password.hash('admin-password-123', { algorithm: 'argon2id' }),
        ]);

        const [withAppUser, withoutAppUser, adminUser] = await Promise.all([
            mAuth.create({ name: 'With App', email: withAppEmail, password: withAppPassword, roles: ['user'], status: 'active', provider: 'local' }),
            mAuth.create({ name: 'Without App', email: withoutAppEmail, password: withoutAppPassword, roles: ['user'], status: 'active', provider: 'local' }),
            mAuth.create({ name: 'Admin', email: adminEmail, password: adminPassword, roles: ['admin'], status: 'active', provider: 'local' }),
        ]);

        await mApps.create({ name: 'HealthTech OS', appKey: 'healthtech_os_v1', userId: withAppUser.id, status: 'active' });

        withAppToken = signAccessToken({ sub: withAppUser.id, email: withAppUser.email, roles: withAppUser.roles, tokenVersion: withAppUser.tokenVersion });
        withoutAppToken = signAccessToken({ sub: withoutAppUser.id, email: withoutAppUser.email, roles: withoutAppUser.roles, tokenVersion: withoutAppUser.tokenVersion });
        adminToken = signAccessToken({ sub: adminUser.id, email: adminUser.email, roles: adminUser.roles, tokenVersion: adminUser.tokenVersion });
    });

    afterAll(async () => {
        const users = await mAuth.find({ email: { $in: [withAppEmail, withoutAppEmail, adminEmail] } }).select('_id');
        await mApps.deleteMany({ userId: { $in: users.map((u) => u._id) } });
        await mAuth.deleteMany({ email: { $in: [withAppEmail, withoutAppEmail, adminEmail] } });
        await db.disconnect();
    });

    test('GET /healthtech/pharmacy rejects anonymous requests', async () => {
        const response = await app.handle(new Request('http://localhost:3000/healthtech/pharmacy'));
        expect(response.status).toBe(401);
    });

    test('GET /healthtech/pharmacy rejects a logged-in user without healthtech_os_v1 installed', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/healthtech/pharmacy', {
                headers: { Authorization: `Bearer ${withoutAppToken}` },
            })
        );
        expect(response.status).toBe(403);
    });

    test('GET /healthtech/pharmacy allows a user with healthtech_os_v1 installed', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/healthtech/pharmacy', {
                headers: { Authorization: `Bearer ${withAppToken}` },
            })
        );
        expect(response.status).toBe(200);
    });

    test('GET /healthtech/pharmacy allows Admin Master regardless of installation', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/healthtech/pharmacy', {
                headers: { Authorization: `Bearer ${adminToken}` },
            })
        );
        expect(response.status).toBe(200);
    });
});
