import { Elysia } from 'elysia';
import { mBvaOrder } from '../models/mBvaOrder';
import { mLogs } from '../models/mLogs';
import { requireAppAccess } from '../middleware/requireAppAccess';

const MAX_ITEMS = 50;
const ORDER_STATUSES = ['new', 'sent_to_whatsapp', 'confirmed', 'delivered', 'cancelled'] as const;

function makeOrderCode(): string {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    return `BVA-${stamp}-${suffix}`;
}

function sanitizeString(value: unknown, max = 500): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
}

function normalizeItems(rawItems: any[]) {
    return rawItems.slice(0, MAX_ITEMS).map((item) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPrice = Math.max(0, Number(item.unitPrice ?? item.price ?? 0));
        return {
            productId: String(item.productId || item.id || '').trim(),
            sku: sanitizeString(item.sku, 80),
            name: sanitizeString(item.name, 180) || 'Produto BVA',
            category: sanitizeString(item.category, 80),
            unitPrice,
            quantity,
            subtotal: Number((unitPrice * quantity).toFixed(2)),
        };
    }).filter((item) => item.productId && item.quantity > 0);
}

function serializeOrder(order: any) {
    const json = typeof order.toJSON === 'function' ? order.toJSON() : order;
    return {
        ...json,
        id: String(order._id || json._id || json.id || ''),
    };
}

export const bvaOrderRoutes = new Elysia({ prefix: '/bva/orders' })
    .post('/', async (ctx: any) => {
        try {
            const body = ctx.body || {};
            const items = normalizeItems(Array.isArray(body.items) ? body.items : []);

            if (!items.length) {
                ctx.set.status = 400;
                return { success: false, error: 'Pedido precisa ter pelo menos um item válido' };
            }

            const calculatedTotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
            const informedTotal = Number(body.total);
            const total = Number.isFinite(informedTotal) && Math.abs(informedTotal - calculatedTotal) <= 0.05
                ? informedTotal
                : calculatedTotal;

            const order = await mBvaOrder.create({
                code: makeOrderCode(),
                appKey: sanitizeString(body.appKey, 40) || 'bva',
                channel: 'whatsapp',
                status: 'sent_to_whatsapp',
                currency: 'BRL',
                total,
                items,
                customer: {
                    name: sanitizeString(body.customer?.name, 120),
                    phone: sanitizeString(body.customer?.phone, 40),
                    email: sanitizeString(body.customer?.email, 180),
                    address: sanitizeString(body.customer?.address, 500),
                    notes: sanitizeString(body.customer?.notes, 1000),
                },
                reseller: {
                    id: sanitizeString(body.reseller?.id, 80),
                    name: sanitizeString(body.reseller?.name, 120),
                    whatsapp: sanitizeString(body.reseller?.whatsapp, 40),
                    instagram: sanitizeString(body.reseller?.instagram, 80),
                },
                whatsappTarget: sanitizeString(body.whatsappTarget, 40),
                source: sanitizeString(body.source, 80) || 'm-bva:index',
                metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
            });

            try {
                await mLogs.create({
                    action: 'CREATE_BVA_ORDER',
                    details: `Pedido ${order.code} criado via ${order.channel}`,
                    user: order.customer?.email || order.customer?.phone || order.reseller?.name,
                    level: 'info',
                    metadata: { orderCode: order.code, total: order.total, appKey: order.appKey },
                });
            } catch {
                // Audit logging must not block checkout.
            }

            ctx.set.status = 201;
            return {
                success: true,
                message: 'Pedido registrado com sucesso',
                data: {
                    code: order.code,
                    status: order.status,
                    total: order.total,
                    id: String(order._id),
                },
            };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })
    .get('/', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const query = ctx.query as Record<string, string>;
        const appKey = query.appKey || 'bva';
        const status = query.status;
        const limit = Math.min(200, Math.max(1, Number(query.limit || 100)));
        const filter: Record<string, any> = { appKey };
        if (status) filter.status = status;
        if (query.resellerId) filter['reseller.id'] = query.resellerId;
        if (query.since || query.until) {
            filter.createdAt = {};
            if (query.since) filter.createdAt.$gte = new Date(query.since);
            if (query.until) filter.createdAt.$lte = new Date(query.until);
        }

        const orders = await mBvaOrder.find(filter).sort({ createdAt: -1 }).limit(limit);
        return { success: true, data: orders.map(serializeOrder), total: orders.length };
    })
    .patch('/:id', async (ctx: any) => {
        const accessError = await requireAppAccess('editor')(ctx);
        if (accessError) return accessError;

        const body = ctx.body as { appKey?: string; status?: string };
        const status = sanitizeString(body?.status, 40);
        if (!status || !ORDER_STATUSES.includes(status as any)) {
            ctx.set.status = 400;
            return { success: false, error: 'Status inválido para pedido BVA' };
        }

        const appKey = sanitizeString(body?.appKey, 40) || ctx.query?.appKey || 'bva';
        const id = String(ctx.params?.id || '').trim();
        const filter = id.startsWith('BVA-')
            ? { appKey, code: id }
            : { appKey, _id: id };

        const order = await mBvaOrder.findOneAndUpdate(
            filter,
            { $set: { status } },
            { new: true }
        );

        if (!order) {
            ctx.set.status = 404;
            return { success: false, error: 'Pedido não encontrado' };
        }

        try {
            await mLogs.create({
                action: 'UPDATE_BVA_ORDER_STATUS',
                details: `Pedido ${order.code} atualizado para ${status}`,
                user: ctx.user?.email || ctx.user?.sub,
                level: 'info',
                metadata: { orderCode: order.code, status, appKey: order.appKey },
            });
        } catch {
            // Audit logging must not block order management.
        }

        return { success: true, data: serializeOrder(order) };
    });
