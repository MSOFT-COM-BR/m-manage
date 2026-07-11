import { Elysia } from 'elysia';
import { mErp } from '../../models/mErp';
import type { IInsumo, IProdutoAttachment, IProdutoFabril, IProdutoVideo, IKardex, IErpConfig, IMaquina, ErpTipo } from '../../models/mErp';
import type { IProductImage } from '../../models/mProduct';
import { checkTenantAccess } from '../../middleware/tenantPlugin';
import { saveAnyUpload, saveUpload, deleteUpload } from '../../services/uploadService';
import { calcularPrecificacao } from '../../services/erpPricing';

// ── helpers ───────────────────────────────────────────────────────────────────

function flat(item: any) {
    return { uuid: item.uuid, ...item.data, _meta: { createdAt: item.createdAt, updatedAt: item.updatedAt } };
}

function normalizeMultipartFiles(value: unknown): File[] {
    const values = Array.isArray(value) ? value : [value];
    return values.filter((item): item is File => {
        return !!item && typeof item !== 'string' && typeof (item as File).name === 'string';
    });
}

// Produtos antigos só têm `imageUrl` (campo único, pré-galeria) — lê como array de 1 imagem primária.
function currentImages(prod: IProdutoFabril): IProductImage[] {
    if (Array.isArray(prod.images)) return prod.images;
    if (prod.imageUrl) return [{ url: prod.imageUrl, isPrimary: true }];
    return [];
}

// Detecta a plataforma pela URL e gera a URL de embed (<iframe src>) correspondente.
function parseVideoUrl(rawUrl: string): IProdutoVideo | null {
    let url: URL;
    try { url = new URL(rawUrl); } catch { return null; }
    const host = url.hostname.replace(/^www\./, '');

    // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
        let videoId = '';
        if (host === 'youtu.be') videoId = url.pathname.slice(1);
        else if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2];
        else videoId = url.searchParams.get('v') || '';
        if (!videoId) return null;
        return { url: rawUrl, platform: 'youtube', embedUrl: `https://www.youtube.com/embed/${videoId}` };
    }

    // Instagram: instagram.com/reel/CODE/ ou /p/CODE/
    if (host === 'instagram.com') {
        const match = url.pathname.match(/\/(reel|p|tv)\/([^/]+)/);
        if (!match) return null;
        return { url: rawUrl, platform: 'instagram', embedUrl: `https://www.instagram.com/${match[1]}/${match[2]}/embed` };
    }

    // TikTok: tiktok.com/@user/video/ID
    if (host === 'tiktok.com') {
        const match = url.pathname.match(/\/video\/(\d+)/);
        if (!match) return null;
        return { url: rawUrl, platform: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}` };
    }

    return null;
}

async function findItem(uuid: string, tipo: ErpTipo, ctx: any, minRole: 'viewer' | 'editor' | 'owner', includeDeleted = false) {
    const filter: any = { uuid, tipo };
    if (!includeDeleted) filter.deletedAt = null;
    const item = await mErp.findOne(filter);
    if (!item) { ctx.set.status = 404; return { err: { success: false, error: 'Registro não encontrado' } }; }
    ctx.query = { ...ctx.query, appKey: item.appKey };
    const guard = await checkTenantAccess(ctx, minRole);
    if (guard) return { err: guard };
    return { item };
}

const DEFAULT_CUSTO_MAQUINA_HORA = 2.5;

// custoEnergiaKwh é a tarifa única do tenant (config global); potência e depreciação são por máquina.
function calcCustoMaquinaHora(custoEnergiaKwh: number, maquina: Pick<IMaquina, 'potenciaWatts' | 'custoDepreciacaoHora'>): number {
    const watts = Number(maquina.potenciaWatts ?? 0);
    const deprec = Number(maquina.custoDepreciacaoHora ?? 0);
    return round2((watts / 1000) * Number(custoEnergiaKwh ?? 0) + deprec);
}

// Config é singleton por tenant — uuid determinístico evita corrida de criação duplicada.
function configUuid(appKey: string): string {
    return `config-${appKey}`;
}

async function getErpConfig(appKey: string): Promise<IErpConfig> {
    const item = await mErp.findOne({ uuid: configUuid(appKey), tipo: 'config' });
    if (item) return item.data as IErpConfig;
    return { custoEnergiaKwh: 0 };
}

// Resolve o custoMaquinaHora efetivo de um produto: máquina selecionada > default fixo.
async function resolveCustoMaquinaHora(appKey: string, maquinaId: string | undefined): Promise<number> {
    if (!maquinaId) return DEFAULT_CUSTO_MAQUINA_HORA;
    const maquina = await mErp.findOne({ uuid: maquinaId, appKey, tipo: 'maquina', deletedAt: null });
    if (!maquina) return DEFAULT_CUSTO_MAQUINA_HORA;
    return (maquina.data as IMaquina).custoMaquinaHora ?? DEFAULT_CUSTO_MAQUINA_HORA;
}

function isAdminJwt(ctx: any): boolean {
    try {
        const auth = ctx.headers?.authorization || '';
        const token = auth.replace('Bearer ', '');
        if (!token) return false;
        const [, payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return Array.isArray(decoded.roles) && decoded.roles.includes('admin');
    } catch { return false; }
}

// ── INSUMOS ───────────────────────────────────────────────────────────────────

const insumoRoutes = new Elysia({ prefix: '/insumos' })

    // GET /erp/insumos?appKey=&alerta=1&deleted=1  — viewer+
    .get('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey, alerta, deleted } = ctx.query as Record<string, string>;
        // deleted=1 mostra apenas insumos arquivados (admin only)
        const showDeleted = deleted === '1' && isAdminJwt(ctx);
        const filter: any = { appKey, tipo: 'insumo' };
        filter.deletedAt = showDeleted ? { $ne: null } : null;
        const items = await mErp.find(filter).sort({ 'data.nome': 1 });
        let data = items.map(i => ({ ...flat(i), _deletedAt: i.deletedAt ?? null }));
        if (alerta === '1') {
            data = data.filter((i: any) => i.qtyEstoque <= i.estoqueMinimo);
        }
        return { success: true, count: data.length, data };
    })

    // GET /erp/insumos/:uuid — viewer+
    .get('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'viewer');
        if (err) return err;
        return { success: true, data: flat(item) };
    })

    // POST /erp/insumos — editor+
    .post('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        const { appKey, ...body } = ctx.body as any;
        if (!appKey || !body.nome || body.custoPorUnidade == null || !body.unidade) {
            ctx.set.status = 400;
            return { success: false, error: 'Campos obrigatórios: appKey, nome, unidade, custoPorUnidade' };
        }
        const uuid = crypto.randomUUID();
        const data: IInsumo = {
            nome: body.nome,
            unidade: body.unidade,
            qtyEstoque: body.qtyEstoque ?? 0,
            custoPorUnidade: Number(body.custoPorUnidade),
            estoqueMinimo: body.estoqueMinimo ?? 0,
            fornecedor: body.fornecedor,
            observacoes: body.observacoes,
        };
        const item = await mErp.create({ uuid, appKey, tipo: 'insumo', data });
        ctx.set.status = 201;
        return { success: true, data: flat(item) };
    })

    // PUT /erp/insumos/:uuid — editor+  (atualiza campos individuais)
    .put('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'editor');
        if (err) return err;
        const { appKey: _ak, ...body } = ctx.body as any;
        const current = item!.data as IInsumo;
        const updated: IInsumo = {
            ...current,
            ...body,
            custoPorUnidade: body.custoPorUnidade != null ? Number(body.custoPorUnidade) : current.custoPorUnidade,
            qtyEstoque: body.qtyEstoque != null ? Number(body.qtyEstoque) : current.qtyEstoque,
            estoqueMinimo: body.estoqueMinimo != null ? Number(body.estoqueMinimo) : current.estoqueMinimo,
        };
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { data: updated } },
            { new: true }
        );
        // Recalcula precificação dos produtos que usam este insumo
        recalcProdutosVinculados(item!.appKey, ctx.params.uuid).catch(() => {});
        return { success: true, data: flat(saved) };
    })

    // PATCH /erp/insumos/:uuid/estoque — editor+  (movimentação rápida de estoque)
    .patch('/:uuid/estoque', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'editor');
        if (err) return err;
        const { delta, motivo } = ctx.body as any;
        if (delta == null) { ctx.set.status = 400; return { success: false, error: 'delta obrigatório' }; }
        const current = item!.data as IInsumo;
        const novoQty = current.qtyEstoque + Number(delta);
        if (novoQty < 0) { ctx.set.status = 400; return { success: false, error: 'Estoque insuficiente' }; }
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.qtyEstoque': novoQty } },
            { new: true }
        );
        // Gera kardex automático
        const kUuid = crypto.randomUUID();
        const kardexData: IKardex = {
            tipo: delta > 0 ? 'ENTRADA' : 'SAIDA',
            subtipo: delta > 0 ? 'COMPRA INSUMO' : 'AJUSTE ESTOQUE',
            descricao: motivo || `Ajuste estoque: ${delta > 0 ? '+' : ''}${delta} ${current.unidade} ${current.nome}`,
            valor: Math.abs(Number(delta)) * current.custoPorUnidade,
            quantidade: Math.abs(Number(delta)),
            referenciaId: ctx.params.uuid,
            operadorEmail: ctx.user?.email,
        };
        await mErp.create({ uuid: kUuid, appKey: item!.appKey, tipo: 'kardex', data: kardexData });
        return { success: true, data: flat(saved), novoEstoque: novoQty, alertaMinimo: novoQty <= (current.estoqueMinimo ?? 0) };
    })

    // POST /erp/insumos/:uuid/image — editor+
    .post('/:uuid/image', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'editor');
        if (err) return err;
        const file: File | undefined = ctx.body?.image;
        if (!file || typeof file === 'string') {
            ctx.set.status = 400;
            return { success: false, error: 'Campo "image" obrigatório (multipart/form-data)' };
        }
        try {
            const oldUrl = (item!.data as IInsumo).imageUrl;
            if (oldUrl?.startsWith('/uploads/')) try { await deleteUpload(oldUrl); } catch {}
            const result = await saveUpload(file, `erp/${item!.appKey}`);
            await mErp.findOneAndUpdate({ uuid: ctx.params.uuid }, { $set: { 'data.imageUrl': result.url } });
            return { success: true, imageUrl: result.url, size: result.size };
        } catch (e: any) {
            ctx.set.status = 400;
            return { success: false, error: e.message };
        }
    })

    // DELETE /erp/insumos/:uuid/image — editor+
    .delete('/:uuid/image', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'editor');
        if (err) return err;
        const url = (item!.data as IInsumo).imageUrl;
        if (url?.startsWith('/uploads/')) try { await deleteUpload(url); } catch {}
        await mErp.findOneAndUpdate({ uuid: ctx.params.uuid }, { $unset: { 'data.imageUrl': 1 } });
        return { success: true, message: 'Imagem removida' };
    })

    // DELETE /erp/insumos/:uuid — admin only (soft delete)
    .delete('/:uuid', async (ctx: any) => {
        if (!isAdminJwt(ctx)) { ctx.set.status = 403; return { success: false, error: 'Apenas administradores podem arquivar insumos' }; }
        const { item, err } = await findItem(ctx.params.uuid, 'insumo', ctx, 'owner');
        if (err) return err;
        await mErp.findOneAndUpdate({ uuid: ctx.params.uuid }, { $set: { deletedAt: new Date() } });
        return { success: true, message: 'Insumo arquivado' };
    })

    // PATCH /erp/insumos/:uuid/restore — admin only (restaura soft delete)
    .patch('/:uuid/restore', async (ctx: any) => {
        if (!isAdminJwt(ctx)) { ctx.set.status = 403; return { success: false, error: 'Apenas administradores podem restaurar insumos' }; }
        // findItem com includeDeleted=true para achar o arquivado
        const item = await mErp.findOne({ uuid: ctx.params.uuid, tipo: 'insumo', deletedAt: { $ne: null } });
        if (!item) { ctx.set.status = 404; return { success: false, error: 'Insumo arquivado não encontrado' }; }
        const restored = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { deletedAt: null } },
            { new: true }
        );
        return { success: true, message: 'Insumo restaurado', data: flat(restored) };
    });

// ── PRODUTOS FABRICADOS ───────────────────────────────────────────────────────

const produtoRoutes = new Elysia({ prefix: '/produtos' })

    // GET /erp/produtos?appKey=&deleted=1 — viewer+
    .get('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey, semEstoque, deleted } = ctx.query as Record<string, string>;
        const showDeleted = deleted === '1' && isAdminJwt(ctx);
        const filter: any = { appKey, tipo: 'produto_fabril' };
        filter.deletedAt = showDeleted ? { $ne: null } : null;
        const items = await mErp.find(filter).sort({ 'data.nome': 1 });
        let data = items.map(i => ({ ...flat(i), _deletedAt: i.deletedAt ?? null }));
        if (semEstoque === '1') data = data.filter((p: any) => p.estoqueAcabado === 0);
        return { success: true, count: data.length, data };
    })

    // GET /erp/produtos/:uuid — viewer+
    .get('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'viewer');
        if (err) return err;
        return { success: true, data: flat(item) };
    })

    // GET /erp/produtos/:uuid/precificacao — viewer+ (recalcula em tempo real)
    .get('/:uuid/precificacao', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'viewer');
        if (err) return err;
        const prod = item!.data as IProdutoFabril;
        const preco = await calcularPrecificacao(item!.appKey, prod);
        return { success: true, produto: prod.nome, precificacao: preco };
    })

    // POST /erp/produtos — editor+
    .post('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        const { appKey, ...body } = ctx.body as any;
        if (!appKey || !body.nome || !body.insumoId || body.pesoGramas == null) {
            ctx.set.status = 400;
            return { success: false, error: 'Campos obrigatórios: appKey, nome, insumoId, pesoGramas' };
        }
        const uuid = crypto.randomUUID();
        const custoMaquinaHora = body.custoMaquinaHora != null
            ? Number(body.custoMaquinaHora)
            : await resolveCustoMaquinaHora(appKey, body.maquinaId);
        const prod: IProdutoFabril = {
            nome: body.nome,
            categoria: body.categoria || 'Geral',
            pesoGramas: Number(body.pesoGramas),
            tempoHoras: Number(body.tempoHoras ?? 1),
            insumoId: body.insumoId,
            embalagemId: body.embalagemId,
            acessoriosIds: body.acessoriosIds || [],
            maquinaId: body.maquinaId || undefined,
            custoMaquinaHora,
            margemAtacado: Number(body.margemAtacado ?? 120),
            margemVarejo: Number(body.margemVarejo ?? 250),
            estoqueAcabado: Number(body.estoqueAcabado ?? 0),
            observacoes: body.observacoes,
            visivelNaVitrine: body.visivelNaVitrine !== false,
            articulado: body.articulado === true,
        };
        // Calcula e persiste preços no momento da criação
        try {
            const preco = await calcularPrecificacao(appKey, prod);
            Object.assign(prod, {
                custoMateriais: preco.custoMateriais,
                custoTotal: preco.custoTotal,
                precoAtacado: preco.precoAtacado,
                precoVarejo: preco.precoVarejo,
            });
        } catch {}
        const item = await mErp.create({ uuid, appKey, tipo: 'produto_fabril', data: prod });
        ctx.set.status = 201;
        return { success: true, data: flat(item) };
    })

    // PUT /erp/produtos/:uuid — editor+
    .put('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const { appKey: _ak, ...body } = ctx.body as any;
        const current = item!.data as IProdutoFabril;
        // Máquina trocada sem custoMaquinaHora explícito → recalcula a partir da nova máquina.
        const trocouMaquina = body.maquinaId !== undefined && body.maquinaId !== current.maquinaId;
        const custoMaquinaHora = body.custoMaquinaHora != null
            ? Number(body.custoMaquinaHora)
            : trocouMaquina
                ? await resolveCustoMaquinaHora(item!.appKey, body.maquinaId)
                : current.custoMaquinaHora;
        const updated: IProdutoFabril = {
            ...current,
            ...body,
            pesoGramas: body.pesoGramas != null ? Number(body.pesoGramas) : current.pesoGramas,
            tempoHoras: body.tempoHoras != null ? Number(body.tempoHoras) : current.tempoHoras,
            custoMaquinaHora,
            margemAtacado: body.margemAtacado != null ? Number(body.margemAtacado) : current.margemAtacado,
            margemVarejo: body.margemVarejo != null ? Number(body.margemVarejo) : current.margemVarejo,
            estoqueAcabado: body.estoqueAcabado != null ? Number(body.estoqueAcabado) : current.estoqueAcabado,
        };
        // Recalcula preços após qualquer edição
        try {
            const preco = await calcularPrecificacao(item!.appKey, updated);
            Object.assign(updated, {
                custoMateriais: preco.custoMateriais,
                custoTotal: preco.custoTotal,
                precoAtacado: preco.precoAtacado,
                precoVarejo: preco.precoVarejo,
            });
        } catch {}
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { data: updated } },
            { new: true }
        );
        return { success: true, data: flat(saved) };
    })

    // PATCH /erp/produtos/:uuid/fabricar — editor+  (registra produção → estoque + kardex)
    .patch('/:uuid/fabricar', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const { quantidade } = ctx.body as any;
        if (!quantidade || quantidade <= 0) {
            ctx.set.status = 400;
            return { success: false, error: 'quantidade obrigatória e > 0' };
        }
        const prod = item!.data as IProdutoFabril;
        const preco = await calcularPrecificacao(item!.appKey, prod);

        // Desconta insumo do estoque
        const consumoGramas = prod.pesoGramas * quantidade;
        const insDoc = await mErp.findOne({ uuid: prod.insumoId, tipo: 'insumo' });
        if (insDoc) {
            const insData = insDoc.data as any;
            const novoEst = insData.qtyEstoque - consumoGramas;
            await mErp.findOneAndUpdate(
                { uuid: prod.insumoId },
                { $set: { 'data.qtyEstoque': Math.max(0, novoEst) } }
            );
        }

        // Incrementa estoque acabado
        const novoEstAcab = prod.estoqueAcabado + quantidade;
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.estoqueAcabado': novoEstAcab } },
            { new: true }
        );

        // Kardex de fabricação
        const kUuid = crypto.randomUUID();
        await mErp.create({
            uuid: kUuid,
            appKey: item!.appKey,
            tipo: 'kardex',
            data: {
                tipo: 'ENTRADA',
                subtipo: 'FABRICAÇÃO 3D',
                descricao: `Produção: +${quantidade} un ${prod.nome} (consumo: -${consumoGramas}g)`,
                valor: preco.custoTotal * quantidade,
                quantidade,
                referenciaId: ctx.params.uuid,
                operadorEmail: ctx.user?.email,
            } as IKardex,
        });

        return {
            success: true,
            data: flat(saved),
            novoEstoque: novoEstAcab,
            consumoInsumoGramas: consumoGramas,
            custoProducao: preco.custoTotal * quantidade,
        };
    })

    // POST /erp/produtos/:uuid/image — editor+  (adiciona 1+ imagens à galeria; campo "image" ou "images")
    .post('/:uuid/image', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const files = [
            ...normalizeMultipartFiles(ctx.body?.images),
            ...normalizeMultipartFiles(ctx.body?.image),
        ];
        if (!files.length) {
            ctx.set.status = 400;
            return { success: false, error: 'Campo "image" obrigatório (multipart/form-data)' };
        }
        try {
            const current = item!.data as IProdutoFabril;
            const existing = currentImages(current);
            const uploaded: IProductImage[] = [];
            for (const file of files) {
                const result = await saveUpload(file, `erp/${item!.appKey}`);
                uploaded.push({ url: result.url, isPrimary: false });
            }
            const merged = [...existing, ...uploaded];
            if (!merged.some(img => img.isPrimary)) merged[0].isPrimary = true;
            const saved = await mErp.findOneAndUpdate(
                { uuid: ctx.params.uuid },
                { $set: { 'data.images': merged }, $unset: { 'data.imageUrl': 1 } },
                { new: true }
            );
            return { success: true, images: merged, data: flat(saved) };
        } catch (e: any) {
            ctx.set.status = 400;
            return { success: false, error: e.message };
        }
    })

    // DELETE /erp/produtos/:uuid/image — editor+  (?url= remove uma imagem específica; sem query remove todas)
    .delete('/:uuid/image', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const current = item!.data as IProdutoFabril;
        const images = currentImages(current);
        const targetUrl = (ctx.query as Record<string, string>)?.url;

        const toRemove = targetUrl ? images.filter(img => img.url === targetUrl) : images;
        for (const img of toRemove) {
            if (img.url?.startsWith('/uploads/')) try { await deleteUpload(img.url); } catch {}
        }

        const remaining = targetUrl ? images.filter(img => img.url !== targetUrl) : [];
        if (remaining.length && !remaining.some(img => img.isPrimary)) remaining[0].isPrimary = true;

        await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.images': remaining }, $unset: { 'data.imageUrl': 1 } },
            { new: true }
        );
        return { success: true, message: 'Imagem removida', images: remaining };
    })

    // PATCH /erp/produtos/:uuid/image/primary — editor+  (define a imagem capa da galeria)
    .patch('/:uuid/image/primary', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const { url } = ctx.body as any;
        if (!url) { ctx.set.status = 400; return { success: false, error: 'Campo "url" obrigatório' }; }
        const current = item!.data as IProdutoFabril;
        const images = currentImages(current);
        if (!images.some(img => img.url === url)) {
            ctx.set.status = 404;
            return { success: false, error: 'Imagem não encontrada na galeria do produto' };
        }
        const updated = images.map(img => ({ ...img, isPrimary: img.url === url }));
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.images': updated } },
            { new: true }
        );
        return { success: true, images: updated, data: flat(saved) };
    })

    // POST /erp/produtos/:uuid/videos — editor+  (adiciona vídeo do YouTube/Instagram/TikTok pela URL)
    .post('/:uuid/videos', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const { url } = ctx.body as any;
        if (!url) { ctx.set.status = 400; return { success: false, error: 'Campo "url" obrigatório' }; }
        const video = parseVideoUrl(url);
        if (!video) {
            ctx.set.status = 400;
            return { success: false, error: 'URL não reconhecida. Use um link de vídeo do YouTube, Instagram ou TikTok.' };
        }
        const current = item!.data as IProdutoFabril;
        const existing = Array.isArray(current.videos) ? current.videos : [];
        if (existing.some(v => v.url === video.url)) {
            ctx.set.status = 409;
            return { success: false, error: 'Este vídeo já foi adicionado ao produto' };
        }
        const videos = [...existing, video];
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.videos': videos } },
            { new: true }
        );
        return { success: true, videos, data: flat(saved) };
    })

    // DELETE /erp/produtos/:uuid/videos?url= — editor+
    .delete('/:uuid/videos', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;
        const targetUrl = (ctx.query as Record<string, string>)?.url;
        if (!targetUrl) { ctx.set.status = 400; return { success: false, error: 'Query "url" obrigatória' }; }
        const current = item!.data as IProdutoFabril;
        const existing = Array.isArray(current.videos) ? current.videos : [];
        const videos = existing.filter(v => v.url !== targetUrl);
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.videos': videos } },
            { new: true }
        );
        return { success: true, message: 'Vídeo removido', videos, data: flat(saved) };
    })

    // POST /erp/produtos/:uuid/attachments — editor+ (qualquer tipo de arquivo)
    .post('/:uuid/attachments', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;

        const files = [
            ...normalizeMultipartFiles(ctx.body?.files),
            ...normalizeMultipartFiles(ctx.body?.file),
            ...normalizeMultipartFiles(ctx.body?.attachment),
        ];

        if (!files.length) {
            ctx.set.status = 400;
            return { success: false, error: 'Campo "files" obrigatório (multipart/form-data)' };
        }

        try {
            const current = item!.data as IProdutoFabril;
            const existing = Array.isArray(current.attachments) ? current.attachments : [];
            const uploaded: IProdutoAttachment[] = [];

            for (const file of files) {
                const result = await saveAnyUpload(file, `erp/${item!.appKey}/attachments`);
                uploaded.push({
                    id: crypto.randomUUID(),
                    filename: result.filename,
                    originalName: result.originalName,
                    url: result.url,
                    size: result.size,
                    mimeType: result.mimeType,
                    uploadedAt: new Date().toISOString(),
                });
            }

            const saved = await mErp.findOneAndUpdate(
                { uuid: ctx.params.uuid },
                { $set: { 'data.attachments': [...existing, ...uploaded] } },
                { new: true }
            );

            return { success: true, attachments: uploaded, data: flat(saved) };
        } catch (e: any) {
            ctx.set.status = 400;
            return { success: false, error: e.message };
        }
    })

    // DELETE /erp/produtos/:uuid/attachments/:attachmentId — editor+
    .delete('/:uuid/attachments/:attachmentId', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'editor');
        if (err) return err;

        const current = item!.data as IProdutoFabril;
        const attachments = Array.isArray(current.attachments) ? current.attachments : [];
        const target = attachments.find(a => a.id === ctx.params.attachmentId || a.filename === ctx.params.attachmentId);

        if (!target) {
            ctx.set.status = 404;
            return { success: false, error: 'Anexo não encontrado' };
        }

        if (target.url?.startsWith('/uploads/')) try { await deleteUpload(target.url); } catch {}

        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { 'data.attachments': attachments.filter(a => a.id !== target.id) } },
            { new: true }
        );

        return { success: true, message: 'Anexo removido', data: flat(saved) };
    })

    // DELETE /erp/produtos/:uuid — admin only (soft delete)
    .delete('/:uuid', async (ctx: any) => {
        if (!isAdminJwt(ctx)) { ctx.set.status = 403; return { success: false, error: 'Apenas administradores podem arquivar produtos' }; }
        const { item, err } = await findItem(ctx.params.uuid, 'produto_fabril', ctx, 'owner');
        if (err) return err;
        await mErp.findOneAndUpdate({ uuid: ctx.params.uuid }, { $set: { deletedAt: new Date() } });
        return { success: true, message: 'Produto arquivado' };
    })

    // PATCH /erp/produtos/:uuid/restore — admin only
    .patch('/:uuid/restore', async (ctx: any) => {
        if (!isAdminJwt(ctx)) { ctx.set.status = 403; return { success: false, error: 'Apenas administradores podem restaurar produtos' }; }
        const item = await mErp.findOne({ uuid: ctx.params.uuid, tipo: 'produto_fabril', deletedAt: { $ne: null } });
        if (!item) { ctx.set.status = 404; return { success: false, error: 'Produto arquivado não encontrado' }; }
        const restored = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { deletedAt: null } },
            { new: true }
        );
        return { success: true, message: 'Produto restaurado', data: flat(restored) };
    });

// ── CONFIGURAÇÃO DE FABRICAÇÃO (singleton por tenant — tarifa de energia) ──────

const configRoutes = new Elysia({ prefix: '/config' })

    // GET /erp/config?appKey= — viewer+  (nunca 404: retorna defaults se ainda não configurado)
    .get('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey } = ctx.query as Record<string, string>;
        if (!appKey) { ctx.set.status = 400; return { success: false, error: 'appKey é obrigatório' }; }
        const data = await getErpConfig(appKey);
        return { success: true, data };
    })

    // PUT /erp/config — editor+  (upsert; recalcula custoMaquinaHora de todas as máquinas do tenant)
    .put('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        const { appKey, ...body } = ctx.body as any;
        if (!appKey) { ctx.set.status = 400; return { success: false, error: 'appKey é obrigatório' }; }
        const data: IErpConfig = {
            custoEnergiaKwh: Number(body.custoEnergiaKwh ?? 0),
            whatsappPrincipal: body.whatsappPrincipal ? String(body.whatsappPrincipal).replace(/\D/g, '') : undefined,
        };
        const saved = await mErp.findOneAndUpdate(
            { uuid: configUuid(appKey), tipo: 'config' },
            { $set: { uuid: configUuid(appKey), appKey, tipo: 'config', data, deletedAt: null } },
            { new: true, upsert: true }
        );
        await recalcMaquinas(appKey, data.custoEnergiaKwh);
        return { success: true, data: flat(saved) };
    });

// GET /erp/config/public?appKey= — SEM autenticação (a loja pública/index.html não tem login).
// Expõe apenas o whatsappPrincipal — nunca custoEnergiaKwh nem outros dados internos do ERP.
const configPublicRoutes = new Elysia({ prefix: '/config' })
    .get('/public', async (ctx: any) => {
        const { appKey } = ctx.query as Record<string, string>;
        if (!appKey) { ctx.set.status = 400; return { success: false, error: 'appKey é obrigatório' }; }
        const cfg = await getErpConfig(appKey);
        return { success: true, data: { whatsappPrincipal: cfg.whatsappPrincipal || null } };
    });

// ── MÁQUINAS (impressoras 3D) ───────────────────────────────────────────────────

const maquinaRoutes = new Elysia({ prefix: '/maquinas' })

    // GET /erp/maquinas?appKey= — viewer+
    .get('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey } = ctx.query as Record<string, string>;
        const items = await mErp.find({ appKey, tipo: 'maquina', deletedAt: null }).sort({ 'data.nome': 1 });
        return { success: true, count: items.length, data: items.map(flat) };
    })

    // POST /erp/maquinas — editor+
    .post('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        const { appKey, ...body } = ctx.body as any;
        if (!appKey || !body.nome || body.potenciaWatts == null) {
            ctx.set.status = 400;
            return { success: false, error: 'Campos obrigatórios: appKey, nome, potenciaWatts' };
        }
        const cfg = await getErpConfig(appKey);
        const potenciaWatts = Number(body.potenciaWatts);
        const custoDepreciacaoHora = Number(body.custoDepreciacaoHora ?? 0);
        const data: IMaquina = {
            nome: body.nome,
            potenciaWatts,
            custoDepreciacaoHora,
            custoMaquinaHora: body.custoMaquinaHora != null
                ? Number(body.custoMaquinaHora)
                : calcCustoMaquinaHora(cfg.custoEnergiaKwh, { potenciaWatts, custoDepreciacaoHora }),
            observacoes: body.observacoes,
        };
        const uuid = crypto.randomUUID();
        const item = await mErp.create({ uuid, appKey, tipo: 'maquina', data });
        ctx.set.status = 201;
        return { success: true, data: flat(item) };
    })

    // PUT /erp/maquinas/:uuid — editor+
    .put('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'maquina', ctx, 'editor');
        if (err) return err;
        const { appKey: _ak, ...body } = ctx.body as any;
        const current = item!.data as IMaquina;
        const potenciaWatts = body.potenciaWatts != null ? Number(body.potenciaWatts) : current.potenciaWatts;
        const custoDepreciacaoHora = body.custoDepreciacaoHora != null ? Number(body.custoDepreciacaoHora) : current.custoDepreciacaoHora;
        const cfg = await getErpConfig(item!.appKey);
        const updated: IMaquina = {
            ...current,
            ...body,
            potenciaWatts,
            custoDepreciacaoHora,
            custoMaquinaHora: body.custoMaquinaHora != null
                ? Number(body.custoMaquinaHora)
                : calcCustoMaquinaHora(cfg.custoEnergiaKwh, { potenciaWatts, custoDepreciacaoHora }),
        };
        const saved = await mErp.findOneAndUpdate(
            { uuid: ctx.params.uuid },
            { $set: { data: updated } },
            { new: true }
        );
        return { success: true, data: flat(saved) };
    })

    // DELETE /erp/maquinas/:uuid — admin only (soft delete)
    .delete('/:uuid', async (ctx: any) => {
        if (!isAdminJwt(ctx)) { ctx.set.status = 403; return { success: false, error: 'Apenas administradores podem arquivar máquinas' }; }
        const { item, err } = await findItem(ctx.params.uuid, 'maquina', ctx, 'owner');
        if (err) return err;
        await mErp.findOneAndUpdate({ uuid: ctx.params.uuid }, { $set: { deletedAt: new Date() } });
        return { success: true, message: 'Máquina arquivada' };
    });

// ── KARDEX ────────────────────────────────────────────────────────────────────

const kardexRoutes = new Elysia({ prefix: '/kardex' })

    // GET /erp/kardex?appKey=&tipo=&subtipo=&limit= — viewer+
    .get('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey, tipo, subtipo, referenciaId, limit = '50' } = ctx.query as Record<string, string>;
        const filter: Record<string, any> = { appKey, tipo: 'kardex' };
        if (tipo) filter['data.tipo'] = tipo;
        if (subtipo) filter['data.subtipo'] = subtipo;
        if (referenciaId) filter['data.referenciaId'] = referenciaId;
        const items = await mErp.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(200, parseInt(limit)));
        return { success: true, count: items.length, data: items.map(flat) };
    })

    // GET /erp/kardex/resumo?appKey= — viewer+ (saldo financeiro)
    .get('/resumo', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'viewer');
        if (guard) return guard;
        const { appKey } = ctx.query as Record<string, string>;
        const items = await mErp.find({ appKey, tipo: 'kardex' });
        let entradas = 0, saidas = 0;
        for (const i of items) {
            const d = i.data as IKardex;
            if (d.tipo === 'ENTRADA') entradas += d.valor;
            else if (d.tipo === 'SAIDA') saidas += d.valor;
        }
        return {
            success: true,
            resumo: {
                entradas: round2(entradas),
                saidas: round2(saidas),
                saldo: round2(entradas - saidas),
                totalMovimentacoes: items.length,
            },
        };
    })

    // POST /erp/kardex — editor+  (lançamento manual)
    .post('/', async (ctx: any) => {
        const guard = await checkTenantAccess(ctx, 'editor');
        if (guard) return guard;
        const { appKey, ...body } = ctx.body as any;
        if (!appKey || !body.tipo || !body.subtipo || !body.descricao || body.valor == null) {
            ctx.set.status = 400;
            return { success: false, error: 'Campos obrigatórios: appKey, tipo, subtipo, descricao, valor' };
        }
        const uuid = crypto.randomUUID();
        const data: IKardex = {
            tipo: body.tipo,
            subtipo: body.subtipo,
            descricao: body.descricao,
            valor: Number(body.valor),
            quantidade: body.quantidade ? Number(body.quantidade) : undefined,
            referenciaId: body.referenciaId,
            operadorEmail: ctx.user?.email,
        };
        const item = await mErp.create({ uuid, appKey, tipo: 'kardex', data });
        ctx.set.status = 201;
        return { success: true, data: flat(item) };
    })

    // DELETE /erp/kardex/:uuid — owner only (estorno)
    .delete('/:uuid', async (ctx: any) => {
        const { item, err } = await findItem(ctx.params.uuid, 'kardex', ctx, 'owner');
        if (err) return err;
        await mErp.findOneAndDelete({ uuid: ctx.params.uuid });
        return { success: true, message: 'Lançamento estornado' };
    });

// ── Recalculo em cascata ──────────────────────────────────────────────────────

async function recalcProdutosVinculados(appKey: string, insumoUuid: string) {
    const produtos = await mErp.find({
        appKey,
        tipo: 'produto_fabril',
        $or: [{ 'data.insumoId': insumoUuid }, { 'data.embalagemId': insumoUuid }, { 'data.acessoriosIds': insumoUuid }],
    });
    for (const p of produtos) {
        const prod = p.data as IProdutoFabril;
        const preco = await calcularPrecificacao(appKey, prod);
        await mErp.findOneAndUpdate(
            { uuid: p.uuid },
            { $set: { 'data.custoMateriais': preco.custoMateriais, 'data.custoTotal': preco.custoTotal, 'data.precoAtacado': preco.precoAtacado, 'data.precoVarejo': preco.precoVarejo } }
        );
    }
}

// Energia global mudou → recalcula custoMaquinaHora de cada máquina do tenant e propaga para os produtos que a usam.
async function recalcMaquinas(appKey: string, custoEnergiaKwh: number) {
    const maquinas = await mErp.find({ appKey, tipo: 'maquina', deletedAt: null });
    for (const m of maquinas) {
        const maq = m.data as IMaquina;
        const custoMaquinaHora = calcCustoMaquinaHora(custoEnergiaKwh, maq);
        await mErp.findOneAndUpdate({ uuid: m.uuid }, { $set: { 'data.custoMaquinaHora': custoMaquinaHora } });

        const produtos = await mErp.find({ appKey, tipo: 'produto_fabril', 'data.maquinaId': m.uuid });
        for (const p of produtos) {
            const prod = { ...(p.data as IProdutoFabril), custoMaquinaHora };
            const preco = await calcularPrecificacao(appKey, prod);
            await mErp.findOneAndUpdate(
                { uuid: p.uuid },
                { $set: {
                    'data.custoMaquinaHora': custoMaquinaHora,
                    'data.custoMateriais': preco.custoMateriais,
                    'data.custoTotal': preco.custoTotal,
                    'data.precoAtacado': preco.precoAtacado,
                    'data.precoVarejo': preco.precoVarejo,
                } }
            );
        }
    }
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// ── Export ────────────────────────────────────────────────────────────────────

export const erpRoutes = new Elysia({ prefix: '/erp' })
    .use(insumoRoutes)
    .use(produtoRoutes)
    .use(configPublicRoutes)
    .use(configRoutes)
    .use(maquinaRoutes)
    .use(kardexRoutes);
