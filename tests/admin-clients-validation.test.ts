import { describe, expect, test } from 'bun:test';
import { app } from '../src/app';
import { isValidCnpj, isValidCpf } from '../src/routes/adminClients';

describe('MSoft client privacy and document validation', () => {
    test('accepts valid CPF/CNPJ and rejects invalid checksums or repeated digits', () => {
        expect(isValidCpf('529.982.247-25')).toBe(true);
        expect(isValidCpf('A52998224725')).toBe(false);
        expect(isValidCpf('111.111.111-11')).toBe(false);
        expect(isValidCpf('529.982.247-24')).toBe(false);
        expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
        expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
        expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
        expect(isValidCnpj('00.000.000/E08G-12')).toBe(true);
        expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
        expect(isValidCnpj('12.ABC.345/01DE-34')).toBe(false);
    });

    test('requires authentication for list, search, detail, create, update and status operations', async () => {
        const requests = [
            new Request('http://localhost:3000/admin/clients'),
            new Request('http://localhost:3000/admin/clients/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: '529.982.247-25' }) }),
            new Request('http://localhost:3000/admin/clients/507f1f77bcf86cd799439011'),
            new Request('http://localhost:3000/admin/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personType: 'PF', name: 'Pessoa' }) }),
            new Request('http://localhost:3000/admin/clients/507f1f77bcf86cd799439011', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pessoa' }) }),
            new Request('http://localhost:3000/admin/clients/507f1f77bcf86cd799439011/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'inactive' }) }),
        ];
        for (const request of requests) expect((await app.handle(request)).status).toBe(401);
    });
});
