import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { app } from '../src/app';
import { db } from '../src/config/database';
import { signAccessToken } from '../src/config/jwt';
import { mAuth } from '../src/models/mAuth';
import { mSoftClient } from '../src/models/mSoftClient';
import { isValidCnpj, isValidCpf } from '../src/routes/adminClients';

if (!process.env.MONGODB_URI) process.env.MONGODB_URI = 'mongodb://localhost:27017/bun-api-test';

describe('Admin Master MSoft clients', () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const adminEmail = `clients_admin_${suffix}@msoft.test`;
    const userEmail = `clients_user_${suffix}@msoft.test`;
    let adminToken = '';
    let userToken = '';
    let adminId = '';
    let revokedToken = '';
    const createdIds: string[] = [];
    const api = (path: string, method = 'GET', payload?: unknown, token = '') => app.handle(new Request(`http://localhost:3000${path}`, {
        method,
        headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }));

    beforeAll(async () => {
        await db.connect();
        const [admin, user] = await Promise.all([
            mAuth.create({ name: 'Client Admin Test', email: adminEmail, roles: ['admin'], status: 'active', tokenVersion: 0 }),
            mAuth.create({ name: 'Client User Test', email: userEmail, roles: ['user'], status: 'active', tokenVersion: 0 }),
        ]);
        adminId = String(admin._id);
        adminToken = signAccessToken({ sub: adminId, email: adminEmail, roles: ['admin'], tokenVersion: 0 });
        revokedToken = adminToken;
        userToken = signAccessToken({ sub: String(user._id), email: userEmail, roles: ['user'], tokenVersion: 0 });
    });

    afterAll(async () => {
        await mSoftClient.deleteMany({ _id: { $in: createdIds } });
        await mAuth.deleteMany({ email: { $in: [adminEmail, userEmail] } });
        await db.disconnect();
    });

    test('valida CPF e CNPJ com dígitos verificadores', () => {
        expect(isValidCpf('529.982.247-25')).toBe(true);
        expect(isValidCpf('111.111.111-11')).toBe(false);
        expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
        expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    });

    test('bloqueia sem sessão, usuários comuns e sessão revogada', async () => {
        expect((await api('/admin/clients')).status).toBe(401);
        expect((await api('/admin/clients', 'GET', undefined, userToken)).status).toBe(403);
        await mAuth.findByIdAndUpdate(adminId, { tokenVersion: 1 });
        expect((await api('/admin/clients', 'GET', undefined, revokedToken)).status).toBe(401);
        await mAuth.findByIdAndUpdate(adminId, { tokenVersion: 0 });
    });

    test('creates PF/PJ, rejects invalid and duplicate documents, and returns only masked document in list', async () => {
        const invalid = await api('/admin/clients', 'POST', { personType: 'PF', name: 'CPF inválido', document: '11111111111' }, adminToken);
        expect(invalid.status).toBe(400);

        const cpf = '52998224725';
        const created = await api('/admin/clients', 'POST', { personType: 'PF', name: 'Pessoa Teste', document: '529.982.247-25', email: `client_${suffix}@msoft.test`, status: 'inactive', roles: ['admin'] }, adminToken);
        expect(created.status).toBe(201);
        const item = (await created.json() as any).data;
        createdIds.push(item.id);
        expect(item.personType).toBe('PF');
        expect(item.status).toBe('active');
        expect(item.document).toBe('***.***.***-25');
        expect(item.roles).toBeUndefined();

        const duplicate = await api('/admin/clients', 'POST', { personType: 'PF', name: 'Duplicado', document: cpf }, adminToken);
        expect(duplicate.status).toBe(409);

        const company = await api('/admin/clients', 'POST', { personType: 'PJ', name: 'Empresa Teste', tradeName: 'Loja Teste', document: '00.000.000/E08G-12' }, adminToken);
        expect(company.status).toBe(201);
        const companyItem = (await company.json() as any).data;
        createdIds.push(companyItem.id);
        expect(companyItem.document).toBe('**.***.***/****-12');
    });

    test('supports PII-safe search, filters, bounded pagination, individual detail, edit and soft status updates', async () => {
        const search = await api('/admin/clients/search?page=1&limit=1&status=active', 'POST', { q: '529.982.247-25' }, adminToken);
        expect(search.status).toBe(200);
        const page = (await search.json() as any).data;
        expect(page.limit).toBe(1);
        expect(page.total).toBeGreaterThanOrEqual(1);
        const personId = createdIds[0];

        const detailResponse = await api(`/admin/clients/${personId}`, 'GET', undefined, adminToken);
        expect(detailResponse.status).toBe(200);
        expect((await detailResponse.json() as any).data.document).toBe('52998224725');

        const edit = await api(`/admin/clients/${personId}`, 'PUT', { name: 'Pessoa Atualizada', tenantId: 'should-not-persist' }, adminToken);
        expect(edit.status).toBe(200);
        expect((await edit.json() as any).data.name).toBe('Pessoa Atualizada');

        const deactivated = await api(`/admin/clients/${personId}/status`, 'PATCH', { status: 'inactive' }, adminToken);
        expect(deactivated.status).toBe(200);
        expect((await deactivated.json() as any).data.status).toBe('inactive');
        const stored = await mSoftClient.findById(personId).lean() as any;
        expect(stored.tenantId).toBeUndefined();
    });
});
