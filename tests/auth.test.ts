import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { signAccessToken } from '../src/config/jwt';
import { mAuth } from '../src/models/mAuth';
import { mAppAccess } from '../src/models/mAppAccess';

// Use test database
if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/bun-api-test';
}

describe('Auth API', () => {
    // Unique email for this test run to avoid collision
    const testUser = {
        name: 'Test User',
        email: `test_${Date.now()}@msoft.com.br`,
        password: 'password123',
        // O endpoint publico deve ignorar qualquer tentativa de escolher admin.
        role: 'admin'
    };
    const masterEmail = `master_${Date.now()}@msoft.com.br`;
    const regularEmail = `regular_${Date.now()}@msoft.com.br`;
    const provisionedEmail = `provisioned_${Date.now()}@msoft.com.br`;
    let masterToken = '';
    let regularToken = '';

    beforeAll(async () => {
        await db.connect();
        await mAuth.deleteMany({ email: { $in: [testUser.email, masterEmail, regularEmail, provisionedEmail] } });

        const [masterPassword, regularPassword] = await Promise.all([
            Bun.password.hash('master-password-123', { algorithm: 'argon2id' }),
            Bun.password.hash('regular-password-123', { algorithm: 'argon2id' }),
        ]);
        const [master, regular] = await Promise.all([
            mAuth.create({
                name: 'Master Test',
                email: masterEmail,
                password: masterPassword,
                roles: ['admin'],
                status: 'active',
                provider: 'local',
            }),
            mAuth.create({
                name: 'Regular Test',
                email: regularEmail,
                password: regularPassword,
                roles: ['user'],
                status: 'active',
                provider: 'local',
            }),
        ]);

        masterToken = signAccessToken({ sub: master.id, email: master.email, roles: master.roles, tokenVersion: master.tokenVersion });
        regularToken = signAccessToken({ sub: regular.id, email: regular.email, roles: regular.roles, tokenVersion: regular.tokenVersion });
    });

    afterAll(async () => {
        const users = await mAuth.find({ email: { $in: [testUser.email, masterEmail, regularEmail, provisionedEmail] } }).select('_id');
        await mAppAccess.deleteMany({ userId: { $in: users.map((user) => user._id) } });
        await mAuth.deleteMany({ email: { $in: [testUser.email, masterEmail, regularEmail, provisionedEmail] } });
        await db.disconnect();
    });

    test('POST /auth/register should create a standard user even when a role is sent', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testUser)
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe(testUser.email);
        expect(data.user.role).toBe('user');
        expect(data.user.roles).toEqual(['user']);
        // Password should not be returned
        expect(data.user.password).toBeUndefined();
        expect(await mAppAccess.countDocuments({ userId: data.user.id })).toBe(0);
    });

    test('POST /auth/login should authenticate user and return token', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testUser.email,
                    password: testUser.password
                })
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.token).toBeDefined();
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe(testUser.email);
    });

    test('POST /auth/login with wrong password should fail', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: testUser.email,
                    password: 'wrongpassword'
                })
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });

    // Test the root /auth route
    test('GET /auth should return 200 and info', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth')
        );
        const data: any = await response.json();
        expect(response.status).toBe(200);
        expect(data.message).toBe('Auth Service Ready');
    });

    test('POST /auth/admin/users rejects requests without an authenticated Admin Master', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Provisioned User',
                    email: provisionedEmail,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'editor',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });

    test('POST /auth/admin/users rejects a standard user', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${regularToken}`,
                },
                body: JSON.stringify({
                    name: 'Provisioned User',
                    email: provisionedEmail,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'editor',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
    });

    test('POST /auth/admin/users creates a standard account with scoped application access', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'Provisioned User',
                    email: provisionedEmail,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'editor',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.user.email).toBe(provisionedEmail);
        expect(data.user.roles).toEqual(['user']);
        expect(data.user.password).toBeUndefined();
        expect(data.access.appKey).toBe('bva');
        expect(data.access.role).toBe('editor');

        const access = await mAppAccess.findOne({ userId: data.user.id, appKey: 'bva' });
        expect(access).not.toBeNull();
        expect(access?.role).toBe('editor');
    });

    test('POST /auth/admin/users rejects an existing e-mail without creating duplicate access', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'Provisioned User Again',
                    email: provisionedEmail,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'owner',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(409);
        expect(data.success).toBe(false);
        expect(await mAuth.countDocuments({ email: provisionedEmail })).toBe(1);
        expect(await mAppAccess.countDocuments({ appKey: 'bva' })).toBe(1);
    });

    test('GET /auth/users rejects requests without an authenticated Admin Master', async () => {
        const response = await app.handle(new Request('http://localhost:3000/auth/users'));
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });

    test('GET /auth/admin/applications exposes provisioned application keys only to Admin Master', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/applications', {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toContainEqual({ appKey: 'bva' });
    });

    test('POST /auth/admin/users rejects an Admin Master token invalidated after issuance', async () => {
        await mAuth.updateOne({ email: masterEmail }, { $inc: { tokenVersion: 1 } });

        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'Should Not Be Created',
                    email: `invalidated_${Date.now()}@msoft.com.br`,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'viewer',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });
});
