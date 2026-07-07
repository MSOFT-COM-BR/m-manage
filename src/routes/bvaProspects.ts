import { Elysia } from 'elysia';
import { mBvaProspect } from '../models/mBvaProspect';
import { requireAppAccess } from '../middleware/requireAppAccess';

const VALID_STATUSES = ['Novo Lead', 'Contatado', 'Em Negociação', 'Parceiro'];

function sanitizeString(value: unknown, max = 500): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
}

function sanitizeNumber(value: unknown): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

function serializeProspect(item: any) {
    const json = typeof item.toJSON === 'function' ? item.toJSON() : item;
    return {
        ...json,
        id: json.uuid || item.uuid,
    };
}

function prospectUpdateFromBody(body: any, fallbackStatus = 'Novo Lead') {
    const status = VALID_STATUSES.includes(body.status) ? body.status : fallbackStatus;
    return {
        appKey: sanitizeString(body.appKey, 40) || 'bva',
        name: sanitizeString(body.name, 180),
        category: sanitizeString(body.category, 80) || 'Lojas',
        address: sanitizeString(body.address, 500),
        phone: sanitizeString(body.phone, 60),
        whatsapp: sanitizeString(body.whatsapp, 60),
        instagram: sanitizeString(body.instagram, 100),
        lat: sanitizeNumber(body.lat),
        lng: sanitizeNumber(body.lng),
        status,
        notes: sanitizeString(body.notes, 1200),
        isAutoFetched: Boolean(body.isAutoFetched),
        source: sanitizeString(body.source, 120) || 'm-bva:portal',
    };
}

export const bvaProspectRoutes = new Elysia({ prefix: '/bva/prospects' })
    .get('/', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const query = ctx.query as Record<string, string>;
        const appKey = query.appKey || 'bva';
        const limit = Math.min(500, Math.max(1, Number(query.limit || 200)));
        const filter: Record<string, any> = { appKey };
        if (query.category && query.category !== 'Todos') filter.category = query.category;
        if (query.status) filter.status = query.status;

        const data = await mBvaProspect.find(filter).sort({ updatedAt: -1 }).limit(limit);
        return { success: true, data: data.map(serializeProspect), total: data.length };
    })
    .get('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const appKey = ctx.query?.appKey || 'bva';
        const data = await mBvaProspect.findOne({ uuid: ctx.params.uuid, appKey });
        if (!data) {
            ctx.set.status = 404;
            return { success: false, error: 'Lead não encontrado' };
        }
        return { success: true, data: serializeProspect(data) };
    })
    .post('/', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const body = ctx.body || {};
        const payload = prospectUpdateFromBody(body);
        if (!payload.name) {
            ctx.set.status = 400;
            return { success: false, error: 'Nome do prospect obrigatório' };
        }

        const uuid = sanitizeString(body.id || body.uuid, 120) || `lead-${crypto.randomUUID()}`;
        const data = await mBvaProspect.findOneAndUpdate(
            { uuid },
            {
                $set: {
                    uuid,
                    ...payload,
                },
            },
            { upsert: true, new: true, runValidators: true }
        );

        ctx.set.status = 201;
        return { success: true, data: serializeProspect(data) };
    })
    .put('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const body = ctx.body || {};
        const appKey = sanitizeString(body.appKey, 40) || ctx.query?.appKey || 'bva';
        const payload = prospectUpdateFromBody({ ...body, appKey }, body.status || 'Novo Lead');
        if (!payload.name) {
            ctx.set.status = 400;
            return { success: false, error: 'Nome do lead obrigatório' };
        }

        const data = await mBvaProspect.findOneAndUpdate(
            { uuid: ctx.params.uuid, appKey },
            { $set: payload },
            { new: true, runValidators: true }
        );
        if (!data) {
            ctx.set.status = 404;
            return { success: false, error: 'Lead não encontrado' };
        }
        return { success: true, data: serializeProspect(data) };
    })
    .patch('/:uuid/status', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const body = ctx.body || {};
        const appKey = sanitizeString(body.appKey, 40) || ctx.query?.appKey || 'bva';
        if (!VALID_STATUSES.includes(body.status)) {
            ctx.set.status = 400;
            return { success: false, error: 'Status inválido' };
        }

        const data = await mBvaProspect.findOneAndUpdate(
            { uuid: ctx.params.uuid, appKey },
            { $set: { status: body.status, source: sanitizeString(body.source, 120) || 'm-bva:portal' } },
            { new: true, runValidators: true }
        );
        if (!data) {
            ctx.set.status = 404;
            return { success: false, error: 'Lead não encontrado' };
        }
        return { success: true, data: serializeProspect(data) };
    })
    .delete('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const appKey = ctx.query?.appKey || 'bva';
        const data = await mBvaProspect.findOneAndDelete({ uuid: ctx.params.uuid, appKey });
        if (!data) {
            ctx.set.status = 404;
            return { success: false, error: 'Lead não encontrado' };
        }
        return { success: true, message: 'Lead removido', data: serializeProspect(data) };
    });
