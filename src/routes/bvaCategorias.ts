import { Elysia } from 'elysia';
import { mBvaCategoria } from '../models/mBvaCategoria';
import { mErp } from '../models/mErp';
import { requireAppAccess } from '../middleware/requireAppAccess';

async function checkAndSeedDefaults(appKey: string) {
    const count = await mBvaCategoria.countDocuments({ appKey });
    if (count === 0) {
        const defaults = [
            { uuid: crypto.randomUUID(), appKey, nome: 'Sensorial', label: '✨ Sensorial & Tátil', ordem: 1, ativa: true, observacoes: 'Brinquedos articulados, fidget toys e peças interativas' },
            { uuid: crypto.randomUUID(), appKey, nome: 'Tecnico', label: '🚀 Criações 3D', ordem: 2, ativa: true, observacoes: 'Modelos técnicos, utilitários e peças de precisão' },
            { uuid: crypto.randomUUID(), appKey, nome: 'Colecionaveis', label: '🏆 Colecionáveis', ordem: 3, ativa: true, observacoes: 'Action figures, esculturas e peças de colecionador' },
        ];
        await mBvaCategoria.insertMany(defaults);
    }
}

function serializeCategoria(item: any) {
    const json = typeof item.toJSON === 'function' ? item.toJSON() : item;
    return {
        ...json,
        id: json.uuid || item.uuid,
    };
}

export const bvaCategoriaRoutes = new Elysia({ prefix: '/bva/categorias' })
    // Rota pública para vitrine (loja digital)
    .get('/public', async (ctx: any) => {
        const query = ctx.query as Record<string, string>;
        const appKey = query.appKey || 'bva';
        await checkAndSeedDefaults(appKey);

        const data = await mBvaCategoria.find({ appKey, ativa: true }).sort({ ordem: 1, nome: 1 });
        return { success: true, data: data.map(serializeCategoria), total: data.length };
    })
    // Listagem geral para admin (inclui inativas)
    .get('/', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const query = ctx.query as Record<string, string>;
        const appKey = query.appKey || 'bva';
        await checkAndSeedDefaults(appKey);

        const filter: Record<string, any> = { appKey };
        if (query.ativa !== undefined) filter.ativa = query.ativa === 'true';

        const data = await mBvaCategoria.find(filter).sort({ ordem: 1, nome: 1 });
        return { success: true, data: data.map(serializeCategoria), total: data.length };
    })
    // Busca por UUID
    .get('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('viewer')(ctx);
        if (accessError) return accessError;

        const item = await mBvaCategoria.findOne({ uuid: ctx.params.uuid });
        if (!item) {
            ctx.set.status = 404;
            return { success: false, error: 'Categoria não encontrada' };
        }
        return { success: true, data: serializeCategoria(item) };
    })
    // Criação de categoria
    .post('/', async (ctx: any) => {
        const accessError = await requireAppAccess('editor')(ctx);
        if (accessError) return accessError;

        const body = ctx.body as any;
        const appKey = (body.appKey || 'bva').trim();
        const nome = (body.nome || '').trim();
        const label = (body.label || '').trim();
        const ordem = Number(body.ordem || 0);
        const ativa = body.ativa !== undefined ? Boolean(body.ativa) : true;
        const observacoes = (body.observacoes || '').trim();

        if (!nome || !label) {
            ctx.set.status = 400;
            return { success: false, error: 'O código/nome e o rótulo (label) da categoria são obrigatórios' };
        }

        const existing = await mBvaCategoria.findOne({ appKey, nome: { $regex: new RegExp('^' + nome + '$', 'i') } });
        if (existing) {
            ctx.set.status = 409;
            return { success: false, error: 'Já existe uma categoria cadastrada com o nome/código informado' };
        }

        const uuid = crypto.randomUUID();
        const item = await mBvaCategoria.create({
            uuid,
            appKey,
            nome,
            label,
            ordem,
            ativa,
            observacoes,
        });

        ctx.set.status = 201;
        return { success: true, data: serializeCategoria(item) };
    })
    // Edição de categoria
    .put('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('editor')(ctx);
        if (accessError) return accessError;

        const item = await mBvaCategoria.findOne({ uuid: ctx.params.uuid });
        if (!item) {
            ctx.set.status = 404;
            return { success: false, error: 'Categoria não encontrada' };
        }

        const body = ctx.body as any;
        const oldNome = item.nome;
        const newNome = (body.nome || item.nome).trim();
        const label = (body.label || item.label).trim();
        const ordem = body.ordem !== undefined ? Number(body.ordem) : item.ordem;
        const ativa = body.ativa !== undefined ? Boolean(body.ativa) : item.ativa;
        const observacoes = body.observacoes !== undefined ? (body.observacoes || '').trim() : item.observacoes;

        if (!newNome || !label) {
            ctx.set.status = 400;
            return { success: false, error: 'O código/nome e o rótulo (label) não podem ficar vazios' };
        }

        if (newNome.toLowerCase() !== oldNome.toLowerCase()) {
            const existing = await mBvaCategoria.findOne({
                appKey: item.appKey,
                nome: { $regex: new RegExp('^' + newNome + '$', 'i') },
                uuid: { $ne: item.uuid },
            });
            if (existing) {
                ctx.set.status = 409;
                return { success: false, error: 'Já existe outra categoria com esse nome/código' };
            }
        }

        item.nome = newNome;
        item.label = label;
        item.ordem = ordem;
        item.ativa = ativa;
        item.observacoes = observacoes;
        await item.save();

        // Se o nome/código mudou, migra automaticamente todos os produtos fabris associados!
        if (oldNome !== newNome) {
            await mErp.updateMany(
                { appKey: item.appKey, tipo: 'produto_fabril', 'data.categoria': oldNome },
                { $set: { 'data.categoria': newNome } }
            );
        }

        return { success: true, data: serializeCategoria(item) };
    })
    // Exclusão
    .delete('/:uuid', async (ctx: any) => {
        const accessError = await requireAppAccess('editor')(ctx);
        if (accessError) return accessError;

        const item = await mBvaCategoria.findOne({ uuid: ctx.params.uuid });
        if (!item) {
            ctx.set.status = 404;
            return { success: false, error: 'Categoria não encontrada' };
        }

        // Verifica se existem produtos vinculados
        const countProd = await mErp.countDocuments({
            appKey: item.appKey,
            tipo: 'produto_fabril',
            'data.categoria': item.nome,
            deletedAt: null,
        });

        if (countProd > 0) {
            ctx.set.status = 400;
            return {
                success: false,
                error: `Não é possível excluir esta categoria pois ela está vinculada a ${countProd} produto(s) ativo(s). Desative a categoria ou mude a categoria dos produtos antes de excluir.`,
            };
        }

        await mBvaCategoria.deleteOne({ uuid: item.uuid });
        return { success: true, message: 'Categoria excluída com sucesso' };
    });
