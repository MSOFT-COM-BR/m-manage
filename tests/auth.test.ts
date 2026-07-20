import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { signAccessToken } from '../src/config/jwt';
import { mAuth } from '../src/models/mAuth';
import { mAppAccess } from '../src/models/mAppAccess';
import { mApps } from '../src/models/mApps';
import { mCatalog } from '../src/models/mCatalog';

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
    const protectedAdminEmail = `protected_admin_${Date.now()}@msoft.com.br`;
    const regularEmail = `regular_${Date.now()}@msoft.com.br`;
    const provisionedEmail = `provisioned_${Date.now()}@msoft.com.br`;
    let masterToken = '';
    let regularToken = '';
    let masterId = '';
    let protectedAdminId = '';
    let provisionedUserId = '';
    let provisionedToken = '';

    const testAppKey = `test-app-${Date.now()}`;

    beforeAll(async () => {
        await db.connect();
        await mAuth.deleteMany({ email: { $in: [testUser.email, masterEmail, protectedAdminEmail, regularEmail, provisionedEmail] } });
        await mCatalog.deleteMany({ appKey: testAppKey });
        await mCatalog.create({
            name: 'Test App',
            appKey: testAppKey,
            description: 'App de teste para as rotas administrativas de mApps.',
            type: 'free',
            icon: 'bi-box',
        });

        const [masterPassword, protectedAdminPassword, regularPassword] = await Promise.all([
            Bun.password.hash('master-password-123', { algorithm: 'argon2id' }),
            Bun.password.hash('protected-admin-password-123', { algorithm: 'argon2id' }),
            Bun.password.hash('regular-password-123', { algorithm: 'argon2id' }),
        ]);
        const [master, protectedAdmin, regular] = await Promise.all([
            mAuth.create({
                name: 'Master Test',
                email: masterEmail,
                password: masterPassword,
                roles: ['admin'],
                status: 'active',
                provider: 'local',
            }),
            mAuth.create({
                name: 'Protected Admin Test',
                email: protectedAdminEmail,
                password: protectedAdminPassword,
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
        masterId = master.id;
        protectedAdminId = protectedAdmin.id;
    });

    afterAll(async () => {
        const users = await mAuth.find({ email: { $in: [testUser.email, masterEmail, protectedAdminEmail, regularEmail, provisionedEmail] } }).select('_id');
        await mAppAccess.deleteMany({ userId: { $in: users.map((user) => user._id) } });
        await mApps.deleteMany({ userId: { $in: users.map((user) => user._id) } });
        await mAuth.deleteMany({ email: { $in: [testUser.email, masterEmail, protectedAdminEmail, regularEmail, provisionedEmail] } });
        await mCatalog.deleteMany({ appKey: testAppKey });
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

    test('POST /auth/admin/users rejects a payload that attempts to set global roles', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'Escalation Attempt',
                    email: provisionedEmail,
                    password: 'provisioned-password-123',
                    appKey: 'bva',
                    appRole: 'viewer',
                    roles: ['admin'],
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(await mAuth.countDocuments({ email: provisionedEmail })).toBe(0);
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
        provisionedUserId = data.user.id;

        const provisioned = await mAuth.findById(provisionedUserId);
        provisionedToken = signAccessToken({
            sub: provisioned!.id,
            email: provisioned!.email,
            roles: provisioned!.roles,
            tokenVersion: provisioned!.tokenVersion,
        });

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

    test('GET /auth/admin/users lists scoped users without exposing Admin Master accounts', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users?q=provisioned', {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveLength(1);
        expect(data.data[0].id).toBe(provisionedUserId);
        expect(data.data[0].roles).toBeUndefined();
        expect(data.data[0].appAccesses).toContainEqual(expect.objectContaining({ appKey: 'bva', role: 'editor' }));
    });

    test('GET /auth/admin/users rejects a standard user', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/users', {
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
    });

    test('CRUD never exposes or allows management of Admin Master accounts', async () => {
        const protectedAdminResponse = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${protectedAdminId}`, {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const selfResponse = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${masterId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await protectedAdminResponse.json();

        expect(protectedAdminResponse.status).toBe(403);
        expect(selfResponse.status).toBe(403);
        expect(data.success).toBe(false);
    });

    test('PUT /auth/admin/users/:id rejects global role and direct status fields', async () => {
        for (const body of [{ roles: ['admin'] }, { status: 'inactive' }]) {
            const response = await app.handle(
                new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${masterToken}`,
                    },
                    body: JSON.stringify(body),
                })
            );
            const data: any = await response.json();

            expect(response.status).toBe(400);
            expect(data.success).toBe(false);
        }
    });

    test('PUT /auth/admin/users/:id updates a scoped user and invalidates its session', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'Provisioned User Updated',
                    password: 'updated-provisioned-password-123',
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.user.name).toBe('Provisioned User Updated');
        expect(data.user.roles).toBeUndefined();

        const oldSession = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                headers: { Authorization: `Bearer ${provisionedToken}` },
            })
        );
        expect(oldSession.status).toBe(401);
    });

    test('PUT and DELETE access endpoints manage only application permissions', async () => {
        const grantResponse = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/access/healthtech`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ role: 'owner' }),
            })
        );
        const grantData: any = await grantResponse.json();

        expect(grantResponse.status).toBe(200);
        expect(grantData.access).toMatchObject({ appKey: 'healthtech', role: 'owner' });

        const revokeResponse = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/access/bva`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const revokeData: any = await revokeResponse.json();

        expect(revokeResponse.status).toBe(200);
        expect(revokeData.success).toBe(true);
        expect(await mAppAccess.findOne({ userId: provisionedUserId, appKey: 'bva' })).toBeNull();
        expect(await mAppAccess.findOne({ userId: provisionedUserId, appKey: 'healthtech' })).not.toBeNull();
    });

    test('PUT /auth/admin/users/:id/apps/:appKey installs a catalog app for the managed user', async () => {
        const installResponse = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/${testAppKey}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const installData: any = await installResponse.json();

        expect(installResponse.status).toBe(200);
        expect(installData.success).toBe(true);
        expect(installData.data).toMatchObject({ appKey: testAppKey, name: 'Test App', status: 'active' });
        expect(await mApps.findOne({ userId: provisionedUserId, appKey: testAppKey })).not.toBeNull();

        // Idempotente: instalar de novo nao cria duplicata (indice unico userId+appKey)
        const secondInstall = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/${testAppKey}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        expect(secondInstall.status).toBe(200);
        expect(await mApps.countDocuments({ userId: provisionedUserId, appKey: testAppKey })).toBe(1);
    });

    test('PUT /auth/admin/users/:id/apps/:appKey rejects an appKey outside the catalog', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/not-in-catalog`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        expect(response.status).toBe(404);
        expect(await mApps.findOne({ userId: provisionedUserId, appKey: 'not-in-catalog' })).toBeNull();
    });

    test('PUT /auth/admin/users/:id/apps/:appKey rejects a standard user', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/${testAppKey}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        expect(response.status).toBe(403);
    });

    test('GET /auth/admin/users/:id/apps lists installed apps for the managed user', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps`, {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toContainEqual(expect.objectContaining({ appKey: testAppKey, status: 'active' }));
    });

    test('DELETE /auth/admin/users/:id/apps/:appKey removes the installed app', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/${testAppKey}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(await mApps.findOne({ userId: provisionedUserId, appKey: testAppKey })).toBeNull();

        const secondDelete = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/apps/${testAppKey}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        expect(secondDelete.status).toBe(404);
    });

    test('DELETE /auth/admin/users/:id deactivates the account and revokes all application access', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();
        const user = await mAuth.findById(provisionedUserId);

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(user).not.toBeNull();
        expect(user?.status).toBe('inactive');
        expect(await mAppAccess.countDocuments({ userId: provisionedUserId })).toBe(0);

        const grantInactiveUser = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/access/bva`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ role: 'viewer' }),
            })
        );
        expect(grantInactiveUser.status).toBe(409);
    });

    test('POST /auth/admin/users/:id/reactivate never restores stale application access', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/auth/admin/users/${provisionedUserId}/reactivate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.user.status).toBe('active');
        expect(data.user.appAccesses).toEqual([]);
        expect(await mAppAccess.countDocuments({ userId: provisionedUserId })).toBe(0);
    });

    test('GET /auth/users rejects requests without an authenticated Admin Master', async () => {
        const response = await app.handle(new Request('http://localhost:3000/auth/users'));
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });

    test('GET /auth/admin/applications exposes no stale keys and rejects standard users', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/admin/applications', {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const regularResponse = await app.handle(
            new Request('http://localhost:3000/auth/admin/applications', {
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).not.toContainEqual({ appKey: 'bva' });
        expect(regularResponse.status).toBe(403);
    });

    test('PUT /auth/me updates the caller own name without invalidating the session', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${regularToken}`,
                },
                body: JSON.stringify({ name: 'Regular Renamed' }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.user.name).toBe('Regular Renamed');

        // Sessao continua valida — so troca de senha invalida.
        const meResponse = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        expect(meResponse.status).toBe(200);
    });

    test('PUT /auth/me rejects an attempt to escalate role/email/status via the payload', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${regularToken}`,
                },
                body: JSON.stringify({ name: 'Still Regular', roles: ['admin'], email: 'hijack@msoft.com.br', status: 'active' }),
            })
        );
        expect(response.status).toBe(400);

        const user = await mAuth.findOne({ email: regularEmail });
        expect(user?.roles).toEqual(['user']);
        expect(user?.email).toBe(regularEmail);
    });

    test('PUT /auth/me rejects requests without authentication', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Nobody' }),
            })
        );
        expect(response.status).toBe(401);
    });

    test('PUT /auth/me changing the password invalidates the current session', async () => {
        const passwordResponse = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${regularToken}`,
                },
                body: JSON.stringify({ password: 'brand-new-password-123' }),
            })
        );
        expect(passwordResponse.status).toBe(200);

        const oldSession = await app.handle(
            new Request('http://localhost:3000/auth/me', {
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        expect(oldSession.status).toBe(401);

        const login = await app.handle(
            new Request('http://localhost:3000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: regularEmail, password: 'brand-new-password-123' }),
            })
        );
        const loginData: any = await login.json();
        expect(login.status).toBe(200);
        expect(loginData.success).toBe(true);
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
