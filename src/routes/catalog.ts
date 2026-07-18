import { Elysia, t } from 'elysia';
import { mCatalog } from '../models/mCatalog';
import { requireAuth } from '../middleware/requireAuth';

export const catalogRoutes = new Elysia({ prefix: '/catalog' })

    // List all available apps/products
    .get('/', async ({ set }) => {
        try {
            const items = await mCatalog.find().sort({ price: 1 });
            return { success: true, data: items };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // Get specific app by key
    .get('/:key', async ({ params, set }) => {
        try {
            const item = await mCatalog.findOne({ appKey: params.key });
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
            const seedData = [
                // Free Tools
                { name: 'Gerador de Senha', appKey: 'password-gen', type: 'free', price: 0, icon: 'bi-key', description: 'Crie senhas fortes e seguras com opções personalizáveis.' },
                { name: 'Calculadora de %', appKey: 'percentage-calc', type: 'free', price: 0, icon: 'bi-percent', description: 'Cálculos rápidos de porcentagem, desconto e aumento.' },
                { name: 'Gerador CPF/CNPJ', appKey: 'doc-gen', type: 'free', price: 0, icon: 'bi-person-badge', description: 'Gere e valide documentos para testes de desenvolvimento.' },
                { name: 'JSON Formatter', appKey: 'json-formatter', type: 'free', price: 0, icon: 'bi-braces', description: 'Valide e formate arquivos JSON desorganizados.' },
                { name: 'Base64 Converter', appKey: 'base64-converter', type: 'free', price: 0, icon: 'bi-shield-lock', description: 'Codifique e decodifique textos em Base64 facilmente.' },
                { name: 'De/Para Universal', appKey: 'depara-transform', type: 'free', price: 0, icon: 'bi-arrow-left-right', description: 'Substituição em massa e mapeamento direto de textos e JSON.' },

                // Premium Apps
                { name: 'Analytics Pro', appKey: 'analytics-pro', type: 'subscription', price: 49.90, icon: 'bi-graph-up-arrow', description: 'Dashboard avançado com métricas em tempo real.' },
                { name: 'E-commerce Builder', appKey: 'ecommerce-builder', type: 'one-time', price: 199.00, icon: 'bi-cart4', description: 'Construa lojas virtuais completas.' },
                { name: 'SEO Toolkit', appKey: 'seo-toolkit', type: 'subscription', price: 29.90, icon: 'bi-search', description: 'Otimização de páginas e análise de keywords.' },
                { name: 'API Gateway Plus', appKey: 'api-gateway', type: 'one-time', price: 149.00, icon: 'bi-hdd-network', description: 'Gerencie suas APIs com rate limiting e logs.' },
                { name: 'CRM Enterprise', appKey: 'crm-enterprise', type: 'subscription', price: 79.90, icon: 'bi-people', description: 'Gestão completa de clientes e funil de vendas.' },
                { name: 'Landing Page Kit', appKey: 'landing-kit', type: 'one-time', price: 89.00, icon: 'bi-layout-text-window-reverse', features: ['50+ Templates'], description: 'Templates de landing pages responsivas.' }
            ];

            // Upsert all
            for (const item of seedData) {
                await mCatalog.findOneAndUpdate(
                    { appKey: item.appKey },
                    item,
                    { upsert: true, new: true }
                );
            }

            return { success: true, message: 'Catalog seeded successfully' };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    });
