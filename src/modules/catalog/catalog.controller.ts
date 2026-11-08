import { Elysia, t } from 'elysia';
import { mCatalog } from '../../models/mCatalog';
import { requireAuth, requireMasterAdmin } from '../../middleware/requireAuth';

const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PUBLIC_CATALOG_FIELDS = 'name appKey description type icon category features';

const catalogAdminCreateBody = t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    appKey: t.String({ minLength: 2, maxLength: 64 }),
    description: t.String({ minLength: 1, maxLength: 1000 }),
    price: t.Optional(t.Number({ minimum: 0 })),
    currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
    type: t.Optional(t.String({ pattern: '^(free|subscription|one-time)$' })),
    icon: t.Optional(t.String({ maxLength: 60 })),
    category: t.Optional(t.String({ maxLength: 60 })),
    features: t.Optional(t.Array(t.String({ maxLength: 120 }))),
}, { additionalProperties: false });

const catalogAdminUpdateBody = t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    description: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
    price: t.Optional(t.Number({ minimum: 0 })),
    currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
    type: t.Optional(t.String({ pattern: '^(free|subscription|one-time)$' })),
    icon: t.Optional(t.String({ maxLength: 60 })),
    category: t.Optional(t.String({ maxLength: 60 })),
    features: t.Optional(t.Array(t.String({ maxLength: 120 }))),
    active: t.Optional(t.Boolean()),
    // A chave identifica o item e nao pode ser trocada por update.
    appKey: t.Optional(t.Never()),
}, { additionalProperties: false });

export const CATALOG_SEED_DATA = [
    // Free Tools
    { name: 'Gerador de Senha', appKey: 'password-gen', type: 'free', price: 0, icon: 'bi-key', description: 'Crie senhas fortes e seguras com opções personalizáveis.' },
    { name: 'Calculadora de %', appKey: 'percentage-calc', type: 'free', price: 0, icon: 'bi-percent', description: 'Cálculos rápidos de porcentagem, desconto e aumento.' },
    { name: 'Gerador CPF/CNPJ', appKey: 'doc-gen', type: 'free', price: 0, icon: 'bi-person-badge', description: 'Gere e valide documentos para testes de desenvolvimento.' },
    { name: 'JSON Formatter', appKey: 'json-formatter', type: 'free', price: 0, icon: 'bi-braces', description: 'Valide e formate arquivos JSON desorganizados.' },
    { name: 'Base64 Converter', appKey: 'base64-converter', type: 'free', price: 0, icon: 'bi-shield-lock', description: 'Codifique e decodifique textos em Base64 facilmente.' },
    { name: 'De/Para Universal', appKey: 'depara-transform', type: 'free', price: 0, icon: 'bi-arrow-left-right', description: 'Substituição em massa e mapeamento direto de textos e JSON.' },
    { name: 'XML NFe → JSON', appKey: 'nfe-xml-json', type: 'free', price: 0, icon: 'bi-file-earmark-code', description: 'Converta XML de NFe/NFCe para JSON estruturado instantaneamente.' },

    // Premium Apps
    { name: 'Analytics Pro', appKey: 'analytics-pro', type: 'subscription', price: 49.90, icon: 'bi-graph-up-arrow', description: 'Dashboard avançado com métricas em tempo real.' },
    { name: 'E-commerce Builder', appKey: 'ecommerce-builder', type: 'one-time', price: 199.00, icon: 'bi-cart4', description: 'Construa lojas virtuais completas.' },
    { name: 'SEO Toolkit', appKey: 'seo-toolkit', type: 'subscription', price: 29.90, icon: 'bi-search', description: 'Otimização de páginas e análise de keywords.' },
    { name: 'API Gateway Plus', appKey: 'api-gateway', type: 'one-time', price: 149.00, icon: 'bi-hdd-network', description: 'Gerencie suas APIs com rate limiting e logs.' },
    { name: 'CRM Enterprise', appKey: 'crm-enterprise', type: 'subscription', price: 79.90, icon: 'bi-people', description: 'Gestão completa de clientes e funil de vendas.' },
    { name: 'Landing Page Kit', appKey: 'landing-kit', type: 'one-time', price: 89.00, icon: 'bi-layout-text-window-reverse', features: ['50+ Templates'], description: 'Templates de landing pages responsivas.' },
    { name: 'M-Care', appKey: 'm-care', type: 'subscription', price: 497, currency: 'BRL', icon: 'bi-heart-pulse', category: 'Saúde', features: ['Operação clínica', 'Coletas ABA offline', 'Gestão por tenant'], description: 'Plataforma para operação clínica multidisciplinar, com foco em rotina ABA, continuidade de registros e governança.' }
];

export async function seedCatalog() {
    for (const item of CATALOG_SEED_DATA) {
        await mCatalog.findOneAndUpdate(
            { appKey: item.appKey },
            item,
            { upsert: true, new: true }
        );
    }
}

// Garante que o catálogo nunca fique vazio em produção — POST /catalog/seed
// exige sessão e nunca era chamado manualmente após deploy.
export async function ensureCatalogSeeded() {
    const count = await mCatalog.countDocuments();
    if (count === 0) {
        await seedCatalog();
    }
}

export const catalogRoutes = new Elysia({ prefix: '/catalog' })

    // List all available apps/products — apenas itens ativos
    .get('/', async ({ set }) => {
        try {
            const items = await mCatalog
                .find({ active: { $ne: false } })
                .select(PUBLIC_CATALOG_FIELDS)
                .sort({ name: 1 });
            return { success: true, data: items };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // CRUD administrativo do catalogo (Admin Master) — lista inclui inativos
    .get('/admin', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        try {
            const items = await mCatalog.find().sort({ price: 1 });
            return { success: true, data: items };
        } catch (error: any) {
            ctx.set.status = 500;
            return { success: false, error: error.message };
        }
    })

    .post('/admin', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const { body, set } = ctx;
        const appKey = String(body.appKey || '').trim().toLowerCase();
        if (!APP_KEY_PATTERN.test(appKey)) {
            set.status = 400;
            return { success: false, error: 'appKey inválido.' };
        }

        try {
            const existing = await mCatalog.findOne({ appKey });
            if (existing) {
                set.status = 409;
                return { success: false, error: 'Já existe um item com esse appKey.' };
            }

            const item = await mCatalog.create({ ...body, appKey });
            set.status = 201;
            return { success: true, data: item };
        } catch (error: any) {
            if (error?.code === 11000) {
                set.status = 409;
                return { success: false, error: 'Já existe um item com esse appKey.' };
            }
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, { body: catalogAdminCreateBody })

    .put('/admin/:key', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const { body, params, set } = ctx;
        try {
            const item = await mCatalog.findOneAndUpdate(
                { appKey: params.key },
                { $set: body },
                { new: true, runValidators: true }
            );
            if (!item) {
                set.status = 404;
                return { success: false, error: 'App not found' };
            }
            return { success: true, data: item };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    }, { body: catalogAdminUpdateBody })

    // Soft-delete: o item some do catalogo publico mas fica visivel no CRUD
    // admin, que pode reativa-lo com PUT { active: true }.
    .delete('/admin/:key', async (ctx: any) => {
        const admin = await requireMasterAdmin(ctx);
        if (!admin) return { success: false, error: 'Não autorizado' };

        const { params, set } = ctx;
        try {
            const item = await mCatalog.findOneAndUpdate(
                { appKey: params.key },
                { $set: { active: false } },
                { new: true }
            );
            if (!item) {
                set.status = 404;
                return { success: false, error: 'App not found' };
            }
            return { success: true, message: 'App desativado.', data: item };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Get specific app by key — apenas itens ativos
    .get('/:key', async ({ params, set }) => {
        try {
            const item = await mCatalog
                .findOne({ appKey: params.key, active: { $ne: false } })
                .select(PUBLIC_CATALOG_FIELDS);
            if (!item) {
                set.status = 404;
                return { success: false, error: 'App not found' };
            }
            return { success: true, data: item };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Seed/Init Catalog (Admin helper) — reseta o catálogo inteiro, exige sessão
    .post('/seed', async (ctx: any) => {
        const jwt = requireAuth(ctx);
        if (!jwt) return { success: false, error: 'Não autorizado' };
        const { set } = ctx;
        try {
            await seedCatalog();
            return { success: true, message: 'Catalog seeded successfully' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
