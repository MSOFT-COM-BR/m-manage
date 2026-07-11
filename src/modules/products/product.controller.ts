import { Elysia } from 'elysia';
import { mProduct } from '../../models/mProduct';
import { mErp } from '../../models/mErp';
import type { IProdutoFabril } from '../../models/mErp';
import { checkTenantAccess } from '../../middleware/tenantPlugin';
import { calcularPrecificacao } from '../../services/erpPricing';

function toSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function productSlugFromErp(name: string, uuid: string): string {
    return `${toSlug(name)}-${uuid.slice(0, 6)}`;
}

async function erpProductToPublicProduct(item: any) {
    const data = item.data as IProdutoFabril;
    let precoVarejo = data.precoVarejo ?? 0;
    let precoAtacado = data.precoAtacado ?? 0;
    let custoMateriais = data.custoMateriais ?? 0;
    let custoTotal = data.custoTotal ?? 0;

    try {
        const precificacao = await calcularPrecificacao(item.appKey, data);
        precoVarejo = precificacao.precoVarejo;
        precoAtacado = precificacao.precoAtacado;
        custoMateriais = precificacao.custoMateriais;
        custoTotal = precificacao.custoTotal;
    } catch (error) {
        console.error('[products:erpProductToPublicProduct]', error);
    }

    return {
        uuid: item.uuid,
        appKey: item.appKey,
        name: data.nome,
        slug: productSlugFromErp(data.nome, item.uuid),
        description: data.observacoes || '',
        shortDesc: data.observacoes || '',
        sku: `BVA-ERP-${item.uuid.slice(0, 8).toUpperCase()}`,
        price: precoVarejo,
        comparePrice: precoAtacado || undefined,
        currency: 'BRL',
        category: data.categoria || 'Geral',
        tags: ['produto-3d', data.categoria || 'Geral'].filter(Boolean),
        status: 'active',
        images: Array.isArray(data.images) && data.images.length
            ? data.images.map(img => ({ url: img.url, alt: data.nome, isPrimary: !!img.isPrimary }))
            : data.imageUrl
                ? [{ url: data.imageUrl, alt: data.nome, isPrimary: true }]
                : [],
        videos: Array.isArray(data.videos) ? data.videos : [],
        articulado: data.articulado === true,
        variants: [],
        stock: data.estoqueAcabado ?? 0,
        weight: data.pesoGramas,
        meta: {
            source: 'erp-produto-fabril',
            erpUuid: item.uuid,
            insumoId: data.insumoId,
            embalagemId: data.embalagemId,
            pesoGramas: data.pesoGramas,
            tempoHoras: data.tempoHoras,
            custoMateriais,
            custoTotal,
            precoAtacado,
            precoVarejo,
            categoria: data.categoria,
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}

async function listBvaProductsFromErp(query: Record<string, string>) {
    const { appKey, category, status, tag, page = '1', limit = '20' } = query;

    if (status && status !== 'active') {
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        return {
            success: true,
            data: [],
            pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 },
        };
    }

    const filter: Record<string, any> = {
        appKey,
        tipo: 'produto_fabril',
        deletedAt: null,
        'data.visivelNaVitrine': { $ne: false },
    };
    if (category) filter['data.categoria'] = category;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
        mErp.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limitNum),
        mErp.countDocuments(filter),
    ]);

    let data = await Promise.all(items.map(erpProductToPublicProduct));
    if (tag) data = data.filter(product => product.tags.includes(tag));

    return {
        success: true,
        data,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    };
}

export const productRoutes = new Elysia({ prefix: '/products' })

    // ── ROTAS PÚBLICAS (sem autenticação — vitrine da loja) ──────────────────

    // List products
    .get('/', async ({ query, set }) => {
        try {
            const { appKey, category, status, tag, page = '1', limit = '20' } = query as Record<string, string>;

            if (!appKey) {
                set.status = 400;
                return { success: false, error: 'appKey é obrigatório' };
            }

            if (appKey === 'bva') {
                return await listBvaProductsFromErp(query as Record<string, string>);
            }

            const filter: Record<string, any> = { appKey };
            if (category) filter.category = category;
            if (status) filter.status = status;
            if (tag) filter.tags = tag;

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
            const skip = (pageNum - 1) * limitNum;

            const [items, total] = await Promise.all([
                mProduct.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
                mProduct.countDocuments(filter),
            ]);

            return {
                success: true,
                data: items,
                pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
            };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Get product by UUID
    .get('/:uuid', async ({ params, set }) => {
        try {
            const erpProduct = await mErp.findOne({
                uuid: params.uuid,
                tipo: 'produto_fabril',
                deletedAt: null,
                'data.visivelNaVitrine': { $ne: false },
            });
            if (erpProduct) {
                return { success: true, data: await erpProductToPublicProduct(erpProduct) };
            }

            const product = await mProduct.findOne({ uuid: params.uuid });
            if (!product) { set.status = 404; return { success: false, error: 'Produto não encontrado' }; }
            return { success: true, data: product };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Get product by appKey + slug
    .get('/slug/:appKey/:slug', async ({ params, set }) => {
        try {
            if (params.appKey === 'bva') {
                const erpProducts = await mErp.find({
                    appKey: params.appKey,
                    tipo: 'produto_fabril',
                    deletedAt: null,
                    'data.visivelNaVitrine': { $ne: false },
                });
                const publicProducts = await Promise.all(erpProducts.map(erpProductToPublicProduct));
                const erpProduct = publicProducts.find(product => product.slug === params.slug);
                if (erpProduct) return { success: true, data: erpProduct };
            }

            const product = await mProduct.findOne({ appKey: params.appKey, slug: params.slug });
            if (!product) { set.status = 404; return { success: false, error: 'Produto não encontrado' }; }
            return { success: true, data: product };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // ── ROTAS PROTEGIDAS (requer tenant editor+) ─────────────────────────────

    // Create product
    .post('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        try {
            const data = ctx.body as any;
            if (!data.appKey || !data.name || data.price === undefined) {
                ctx.set.status = 400;
                return { success: false, error: 'appKey, name e price são obrigatórios' };
            }
            const uuid = crypto.randomUUID();
            const slug = data.slug ? data.slug : toSlug(data.name);
            const existing = await mProduct.findOne({ appKey: data.appKey, slug });
            if (existing) {
                ctx.set.status = 409;
                return { success: false, error: `Slug "${slug}" já existe nesta app` };
            }
            const product = await mProduct.create({ ...data, uuid, slug });
            ctx.set.status = 201;
            return { success: true, data: product };
        } catch (error: any) {
            if (error.code === 11000) { ctx.set.status = 409; return { success: false, error: 'Produto duplicado' }; }
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Update product
    .put('/:uuid', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        try {
            const data = ctx.body as any;
            delete data.uuid;
            const product = await mProduct.findOneAndUpdate(
                { uuid: ctx.params.uuid },
                { $set: data },
                { new: true, runValidators: true }
            );
            if (!product) { ctx.set.status = 404; return { success: false, error: 'Produto não encontrado' }; }
            return { success: true, data: product };
        } catch (error: any) {
            if (error.code === 11000) { ctx.set.status = 409; return { success: false, error: 'Slug já em uso' }; }
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Soft delete
    .delete('/:uuid', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        try {
            const product = await mProduct.findOneAndUpdate(
                { uuid: ctx.params.uuid },
                { $set: { status: 'archived' } },
                { new: true }
            );
            if (!product) { ctx.set.status = 404; return { success: false, error: 'Produto não encontrado' }; }
            return { success: true, message: 'Produto arquivado', data: product };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Hard delete
    .delete('/:uuid/hard', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'owner');
        if (guard) return guard;
        try {
            const product = await mProduct.findOneAndDelete({ uuid: ctx.params.uuid });
            if (!product) { ctx.set.status = 404; return { success: false, error: 'Produto não encontrado' }; }
            return { success: true, message: 'Produto removido permanentemente' };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    });
