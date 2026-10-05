import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { requireMasterAdmin } from '../middleware/requireAuth';
import { mSoftClient, MSoftClientPersonType, MSoftClientStatus } from '../models/mSoftClient';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const normalizeDocument = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isValidCpf(value: string): boolean {
    const cpf = String(value ?? '').replace(/[.\-\s]/g, '');
    if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;
    const check = (length: number) => {
        let sum = 0;
        for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
        const digit = (sum * 10) % 11;
        return (digit === 10 ? 0 : digit) === Number(cpf[length]);
    };
    return check(9) && check(10);
}

export function isValidCnpj(value: string): boolean {
    const cnpj = normalizeDocument(value);
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([0-9])\1{13}$/.test(cnpj)) return false;
    const check = (length: number) => {
        const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + (cnpj.charCodeAt(index) - 48) * weight, 0);
        const remainder = sum % 11;
        return (remainder < 2 ? 0 : 11 - remainder) === Number(cnpj[length]);
    };
    return check(12) && check(13);
}

function normalizeInput(body: any, partial = false) {
    const input: Record<string, unknown> = {};
    const allowed = ['personType', 'name', 'tradeName', 'document', 'email', 'phone'] as const;
    for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(body ?? {}, key)) continue;
        const raw = body[key];
        if (raw == null || String(raw).trim() === '') {
            input[key] = key === 'personType' || key === 'name' ? raw : undefined;
        } else if (key === 'document') {
            input[key] = normalizeDocument(raw);
        } else {
            input[key] = String(raw).trim();
        }
    }

    if (!partial && (!input.personType || !input.name)) return { error: 'Informe o tipo de pessoa e o nome.' };
    if (input.personType !== undefined && !['PF', 'PJ'].includes(String(input.personType))) {
        return { error: 'Selecione PF ou PJ.' };
    }
    if (input.name !== undefined && (typeof input.name !== 'string' || input.name.length < 2 || input.name.length > 160)) {
        return { error: 'O nome deve conter entre 2 e 160 caracteres.' };
    }
    if (input.tradeName !== undefined && input.tradeName !== null && (typeof input.tradeName !== 'string' || input.tradeName.length > 160)) {
        return { error: 'O nome fantasia deve ter até 160 caracteres.' };
    }
    if (input.email !== undefined && input.email !== null && (String(input.email).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email)))) {
        return { error: 'Informe um e-mail válido.' };
    }
    if (input.phone !== undefined && input.phone !== null) {
        const phone = digits(input.phone);
        if (phone.length < 10 || phone.length > 15) return { error: 'Informe um telefone válido.' };
        input.phone = phone;
    }
    if (input.document !== undefined && input.document !== null) {
        const type = String(input.personType ?? body?.personType ?? '');
        if (type === 'PF' && !isValidCpf(String(input.document))) return { error: 'Informe um CPF válido para a pessoa física.' };
        if (type === 'PJ' && !isValidCnpj(String(input.document))) return { error: 'Informe um CNPJ válido para a pessoa jurídica.' };
        if (!type) return { error: 'Informe PF ou PJ para validar o documento.' };
    }
    if (input.personType === 'PF') input.tradeName = undefined;
    return { data: input };
}

const maskDocument = (document?: string) => {
    if (!document) return undefined;
    return document.length === 11
        ? `***.***.***-${document.slice(-2)}`
        : `**.***.***/****-${document.slice(-2)}`;
};

const toListItem = (client: any) => ({
    id: String(client._id),
    personType: client.personType,
    name: client.name,
    tradeName: client.tradeName,
    document: maskDocument(client.document),
    email: client.email,
    phone: client.phone,
    status: client.status,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
});

const toDetail = (client: any) => ({
    ...toListItem(client),
    document: client.document,
});

function parsePagination(query: any) {
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(query.page ?? '1'), 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(query.limit ?? '25'), 10) || 25));
    return { page, limit };
}

async function listClients(ctx: any, search = '') {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado.' };
    const { query, set } = ctx;
    const { page, limit } = parsePagination(query);
    const filter: Record<string, any> = {};
    if (query.personType && ['PF', 'PJ'].includes(query.personType)) filter.personType = query.personType as MSoftClientPersonType;
    if (query.status && ['active', 'inactive'].includes(query.status)) filter.status = query.status as MSoftClientStatus;

    const term = search.trim().slice(0, 100);
    if (term) {
        const normalizedDocument = normalizeDocument(term);
        if (/^\d{11}$/.test(normalizedDocument) || /^[A-Z0-9]{12}\d{2}$/.test(normalizedDocument)) {
            filter.document = normalizedDocument;
        } else {
            const expression = new RegExp(escapeRegex(term), 'i');
            filter.$or = [{ name: expression }, { tradeName: expression }, { email: expression }];
        }
    }

    try {
        const [items, total] = await Promise.all([
            mSoftClient.find(filter).select('personType name tradeName document email phone status createdAt updatedAt').sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            mSoftClient.countDocuments(filter),
        ]);
        return { success: true, data: { items: items.map(toListItem), page, limit, total, pages: Math.ceil(total / limit) } };
    } catch {
        set.status = 500;
        return { success: false, error: 'Não foi possível consultar os clientes.' };
    }
}

async function createClient(ctx: any) {
    const admin = await requireMasterAdmin(ctx);
    if (!admin) return { success: false, error: 'Não autorizado.' };
    const { body, set } = ctx;
    const normalized = normalizeInput(body);
    if (normalized.error) { set.status = 400; return { success: false, error: normalized.error }; }
    try {
        const client = await mSoftClient.create({ ...normalized.data, status: 'active' });
        set.status = 201;
        return { success: true, data: toListItem(client) };
    } catch (error: any) {
        if (error?.code === 11000) { set.status = 409; return { success: false, error: 'Já existe um cliente com esse documento.' }; }
        if (error?.name === 'ValidationError') { set.status = 400; return { success: false, error: 'Confira os dados do cliente.' }; }
        set.status = 500;
        return { success: false, error: 'Não foi possível cadastrar o cliente.' };
    }
}

export const adminClientRoutes = new Elysia({ prefix: '/admin/clients' })
    .get('/', (ctx: any) => listClients(ctx))
    .post('/search', (ctx: any) => listClients(ctx, String(ctx.body?.q ?? '')))
    .get('/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado.' };
        const { params, set } = ctx;
        if (!mongoose.isValidObjectId(params.id)) { set.status = 400; return { success: false, error: 'Identificador inválido.' }; }
        try {
            const client = await mSoftClient.findById(params.id).select('personType name tradeName document email phone status createdAt updatedAt').lean();
            if (!client) { set.status = 404; return { success: false, error: 'Cliente não encontrado.' }; }
            return { success: true, data: toDetail(client) };
        } catch {
            set.status = 500;
            return { success: false, error: 'Não foi possível consultar o cliente.' };
        }
    })
    .post('/', createClient)
    .put('/:id', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado.' };
        const { params, body, set } = ctx;
        if (!mongoose.isValidObjectId(params.id)) { set.status = 400; return { success: false, error: 'Identificador inválido.' }; }
        try {
            const current: any = await mSoftClient.findById(params.id).select('personType document').lean();
            if (!current) { set.status = 404; return { success: false, error: 'Cliente não encontrado.' }; }
            const type = String(body?.personType ?? current.personType);
            const normalized = normalizeInput({ ...body, personType: type }, true);
            if (normalized.error) { set.status = 400; return { success: false, error: normalized.error }; }
            const updates = { ...(normalized.data ?? {}) };
            delete updates.personType;
            const unset: Record<string, ''> = {};
            for (const key of ['tradeName', 'email', 'phone', 'document']) {
                if (updates[key] === undefined) delete updates[key];
                const fieldCleared = Object.prototype.hasOwnProperty.call(body ?? {}, key)
                    && (body[key] == null || String(body[key]).trim() === '');
                if (fieldCleared
                    || (key === 'tradeName' && type === 'PF')
                    || (key === 'document' && type !== current.personType && body?.document === undefined)) {
                    delete updates[key];
                    unset[key] = '';
                }
            }
            const update: Record<string, unknown> = { $set: updates };
            if (type !== current.personType) update.$set = { ...updates, personType: type };
            if (Object.keys(unset).length) update.$unset = unset;
            const client = await mSoftClient.findByIdAndUpdate(params.id, update, { new: true, runValidators: true })
                .select('personType name tradeName document email phone status createdAt updatedAt').lean();
            if (!client) { set.status = 404; return { success: false, error: 'Cliente não encontrado.' }; }
            return { success: true, data: toListItem(client) };
        } catch (error: any) {
            if (error?.code === 11000) { set.status = 409; return { success: false, error: 'Já existe um cliente com esse documento.' }; }
            if (error?.name === 'ValidationError') { set.status = 400; return { success: false, error: 'Confira os dados do cliente.' }; }
            set.status = 500;
            return { success: false, error: 'Não foi possível atualizar o cliente.' };
        }
    })
    .patch('/:id/status', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado.' };
        const { params, body, set } = ctx;
        if (!mongoose.isValidObjectId(params.id)) { set.status = 400; return { success: false, error: 'Identificador inválido.' }; }
        const status = body?.status;
        if (!['active', 'inactive'].includes(status)) { set.status = 400; return { success: false, error: 'Selecione um status válido.' }; }
        try {
            const client = await mSoftClient.findByIdAndUpdate(params.id, { $set: { status } }, { new: true, runValidators: true })
                .select('personType name tradeName document email phone status createdAt updatedAt').lean();
            if (!client) { set.status = 404; return { success: false, error: 'Cliente não encontrado.' }; }
            return { success: true, data: toListItem(client) };
        } catch {
            set.status = 500;
            return { success: false, error: 'Não foi possível atualizar o status do cliente.' };
        }
    });
