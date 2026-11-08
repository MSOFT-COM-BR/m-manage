import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Elysia } from 'elysia';
import { CATALOG_SEED_DATA, catalogRoutes } from '../src/routes/catalog';
import { db } from '../src/config/database';
import { signAccessToken } from '../src/config/jwt';
import { mAuth } from '../src/models/mAuth';
import { mCatalog } from '../src/models/mCatalog';

// src/app.ts (legado) nao registra catalogRoutes, entao o teste monta sua
// propria instancia — mesmo padrao de app.handle() dos demais testes.
const app = new Elysia().use(catalogRoutes);

test('the M-Care commercial catalog seed retains its internal reference price', () => {
    expect(CATALOG_SEED_DATA.find((item) => item.appKey === 'm-care')).toMatchObject({
        name: 'M-Care', type: 'subscription', price: 497, currency: 'BRL',
    });
});

// Use test database
if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/bun-api-test';
}

describe('Catalog Admin API', () => {
    const runId = Date.now();
    const masterEmail = `catalog_master_${runId}@msoft.com.br`;
    const regularEmail = `catalog_regular_${runId}@msoft.com.br`;
    const itemKey = `catalog-item-${runId}`;
    const inactiveKey = `catalog-inactive-${runId}`;
    const publicKey = `catalog-public-${runId}`;
    let masterToken = '';
    let regularToken = '';

    beforeAll(async () => {
        await db.connect();
        await mAuth.deleteMany({ email: { $in: [masterEmail, regularEmail] } });
        await mCatalog.deleteMany({ appKey: { $in: [itemKey, inactiveKey, publicKey] } });

        const password = await Bun.password.hash('catalog-password-123', { algorithm: 'argon2id' });
        const [master, regular] = await Promise.all([
            mAuth.create({
                name: 'Catalog Master Test',
                email: masterEmail,
                password,
                roles: ['admin'],
                status: 'active',
                provider: 'local',
            }),
            mAuth.create({
                name: 'Catalog Regular Test',
                email: regularEmail,
                password,
                roles: ['user'],
                status: 'active',
                provider: 'local',
            }),
        ]);

        masterToken = signAccessToken({ sub: master.id, email: master.email, roles: master.roles, tokenVersion: master.tokenVersion });
        regularToken = signAccessToken({ sub: regular.id, email: regular.email, roles: regular.roles, tokenVersion: regular.tokenVersion });

        // Item inativo pre-existente: nao pode aparecer no catalogo publico,
        // mas precisa constar na listagem administrativa.
        await mCatalog.create({
            name: 'Inactive App',
            appKey: inactiveKey,
            description: 'Item desativado para testar a visibilidade.',
            active: false,
        });
        await mCatalog.create({
            name: 'Public Catalog App',
            appKey: publicKey,
            description: 'Item para validar o contrato público.',
            type: 'subscription',
            price: 49.9,
            currency: 'BRL',
        });
    });

    afterAll(async () => {
        await mAuth.deleteMany({ email: { $in: [masterEmail, regularEmail] } });
        await mCatalog.deleteMany({ appKey: { $in: [itemKey, inactiveKey, publicKey] } });
        await db.disconnect();
    });

    test('GET /catalog lists only active items without commercial fields', async () => {
        const response = await app.handle(new Request('http://localhost:3000/catalog'));
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.map((item: any) => item.appKey)).not.toContain(inactiveKey);
        for (const item of data.data) {
            expect(item).not.toHaveProperty('price');
            expect(item).not.toHaveProperty('currency');
        }
    });

    test('GET /catalog/:key returns 404 for an inactive item', async () => {
        const response = await app.handle(new Request(`http://localhost:3000/catalog/${inactiveKey}`));
        const data: any = await response.json();

        expect(response.status).toBe(404);
        expect(data.success).toBe(false);
    });

    test('GET /catalog/:key omits commercial fields for an active paid item', async () => {
        const response = await app.handle(new Request(`http://localhost:3000/catalog/${publicKey}`));
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toMatchObject({ appKey: publicKey, name: 'Public Catalog App', type: 'subscription' });
        expect(data.data).not.toHaveProperty('price');
        expect(data.data).not.toHaveProperty('currency');
    });

    test('GET /catalog/admin rejects requests without authentication', async () => {
        const response = await app.handle(new Request('http://localhost:3000/catalog/admin'));
        const data: any = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
    });

    test('GET /catalog/admin rejects a standard user', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin', {
                headers: { Authorization: `Bearer ${regularToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
    });

    test('GET /catalog/admin lists every item including inactive ones', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin', {
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.map((item: any) => item.appKey)).toContain(inactiveKey);
    });

    test('POST /catalog/admin rejects a standard user', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${regularToken}`,
                },
                body: JSON.stringify({ name: 'New App', appKey: itemKey, description: 'Desc' }),
            })
        );

        expect(response.status).toBe(403);
        expect(await mCatalog.findOne({ appKey: itemKey })).toBeNull();
    });

    test('POST /catalog/admin creates a catalog item', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({
                    name: 'New App',
                    appKey: itemKey,
                    description: 'App criado pelo teste.',
                    type: 'subscription',
                    price: 19.9,
                }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.data).toMatchObject({ appKey: itemKey, type: 'subscription', price: 19.9, active: true });
    });

    test('POST /catalog/admin rejects a duplicated appKey', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ name: 'Duplicated App', appKey: itemKey, description: 'Desc' }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(409);
        expect(data.success).toBe(false);
        expect(await mCatalog.countDocuments({ appKey: itemKey })).toBe(1);
    });

    test('PUT /catalog/admin/:key updates an existing item', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/catalog/admin/${itemKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ name: 'New App Renamed', price: 29.9 }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toMatchObject({ appKey: itemKey, name: 'New App Renamed', price: 29.9 });
    });

    test('PUT /catalog/admin/:key returns 404 for an unknown key', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin/not-in-catalog', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ name: 'Ghost' }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(404);
        expect(data.success).toBe(false);
    });

    test('DELETE /catalog/admin/:key rejects requests without authentication', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/catalog/admin/${itemKey}`, { method: 'DELETE' })
        );

        expect(response.status).toBe(401);
        expect((await mCatalog.findOne({ appKey: itemKey }))?.active).toBe(true);
    });

    test('DELETE /catalog/admin/:key soft-deletes the item', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/catalog/admin/${itemKey}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        const item = await mCatalog.findOne({ appKey: itemKey });
        expect(item).not.toBeNull();
        expect(item?.active).toBe(false);

        const publicResponse = await app.handle(new Request(`http://localhost:3000/catalog/${itemKey}`));
        expect(publicResponse.status).toBe(404);
    });

    test('DELETE /catalog/admin/:key returns 404 for an unknown key', async () => {
        const response = await app.handle(
            new Request('http://localhost:3000/catalog/admin/not-in-catalog', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${masterToken}` },
            })
        );

        expect(response.status).toBe(404);
    });

    test('PUT /catalog/admin/:key reactivates a soft-deleted item', async () => {
        const response = await app.handle(
            new Request(`http://localhost:3000/catalog/admin/${itemKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${masterToken}`,
                },
                body: JSON.stringify({ active: true }),
            })
        );
        const data: any = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.active).toBe(true);

        const publicResponse = await app.handle(new Request(`http://localhost:3000/catalog/${itemKey}`));
        expect(publicResponse.status).toBe(200);
    });
});
