import { mErp } from '../models/mErp';
import type { IInsumo, IProdutoFabril, IProdutoFilamento } from '../models/mErp';

export interface PrecificacaoResult {
    custoMateriais: number;   // custo de filamento + embalagem + acessórios
    custoFabricacao: number;  // custo de máquina (tempoHoras × custoMaquinaHora)
    custoTotal: number;
    precoAtacado: number;
    precoVarejo: number;
    detalhes: {
        insumo: { nome: string; gramas: number; custo: number } | null;
        insumos: { nome: string; gramas: number; custo: number }[];
        embalagem: { nome: string; custo: number } | null;
        acessorios: { nome: string; custo: number }[];
        maquina: number;
    };
}

export async function calcularPrecificacao(
    appKey: string,
    prod: IProdutoFabril
): Promise<PrecificacaoResult> {
    const detalhes: PrecificacaoResult['detalhes'] = {
        insumo: null,
        insumos: [],
        embalagem: null,
        acessorios: [],
        maquina: 0,
    };

    let custoMateriais = 0;

    const filamentos = getProdutoFilamentos(prod);
    for (const filamento of filamentos) {
        const ins = await mErp.findOne({ uuid: filamento.insumoId, appKey, tipo: 'insumo' });
        if (ins) {
            const d = ins.data as IInsumo;
            const custo = filamento.gramas * d.custoPorUnidade;
            custoMateriais += custo;
            detalhes.insumos.push({ nome: d.nome, gramas: filamento.gramas, custo });
        }
    }
    detalhes.insumo = detalhes.insumos[0] || null;

    // Embalagem
    if (prod.embalagemId) {
        const emb = await mErp.findOne({ uuid: prod.embalagemId, appKey, tipo: 'insumo' });
        if (emb) {
            const d = emb.data as IInsumo;
            custoMateriais += d.custoPorUnidade;
            detalhes.embalagem = { nome: d.nome, custo: d.custoPorUnidade };
        }
    }

    // Acessórios extras
    for (const accId of prod.acessoriosIds || []) {
        const acc = await mErp.findOne({ uuid: accId, appKey, tipo: 'insumo' });
        if (acc) {
            const d = acc.data as IInsumo;
            custoMateriais += d.custoPorUnidade;
            detalhes.acessorios.push({ nome: d.nome, custo: d.custoPorUnidade });
        }
    }

    const custoFabricacao = prod.tempoHoras * prod.custoMaquinaHora;
    detalhes.maquina = custoFabricacao;

    const custoTotal = custoMateriais + custoFabricacao;
    const precoAtacado = round2(custoTotal * (1 + prod.margemAtacado / 100));
    const precoVarejo = round2(custoTotal * (1 + prod.margemVarejo / 100));

    return {
        custoMateriais: round2(custoMateriais),
        custoFabricacao: round2(custoFabricacao),
        custoTotal: round2(custoTotal),
        precoAtacado,
        precoVarejo,
        detalhes,
    };
}

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

function getProdutoFilamentos(prod: IProdutoFabril): IProdutoFilamento[] {
    if (Array.isArray(prod.filamentos) && prod.filamentos.length) {
        return prod.filamentos
            .map(item => ({ insumoId: item.insumoId, gramas: Number(item.gramas || 0) }))
            .filter(item => item.insumoId && item.gramas > 0);
    }
    return prod.insumoId && prod.pesoGramas > 0
        ? [{ insumoId: prod.insumoId, gramas: Number(prod.pesoGramas) }]
        : [];
}
