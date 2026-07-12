import { connectMongo } from '../config/mongo';
import { mErp } from '../models/mErp';
import type { IInsumo, IProdutoFabril, IKardex } from '../models/mErp';
import { calcularPrecificacao } from '../services/erpPricing';

const APP_KEY = 'bva';

const insumos = [
    { id: 'ins-1', nome: 'Filamento PLA Rosa Premium (1kg)', unidade: 'g', qtyEstoque: 3500, custoPorUnidade: 0.10, estoqueMinimo: 1000, corHex: '#EC4899', corNome: 'Rosa premium' },
    { id: 'ins-2', nome: 'Filamento PLA Multicolor Seda (1kg)', unidade: 'g', qtyEstoque: 2200, custoPorUnidade: 0.14, estoqueMinimo: 1000, corHex: '#F59E0B', corNome: 'Multicolor seda' },
    { id: 'ins-3', nome: 'Filamento PETG Roxo Alta Resistencia (1kg)', unidade: 'g', qtyEstoque: 1800, custoPorUnidade: 0.12, estoqueMinimo: 1000, corHex: '#7C3AED', corNome: 'Roxo' },
    { id: 'ins-4', nome: 'Embalagem Presenteavel Ludica Studio BVA', unidade: 'un', qtyEstoque: 120, custoPorUnidade: 1.50, estoqueMinimo: 30 },
    { id: 'ins-5', nome: 'Argola de Chaveiro Premium com Girador', unidade: 'un', qtyEstoque: 300, custoPorUnidade: 0.45, estoqueMinimo: 50 },
] satisfies Array<IInsumo & { id: string }>;

const produtos = [
    { id: 'prod-1', nome: 'Dragao Articulado Sensorial (20cm)', categoria: 'Animais 3D', pesoGramas: 85, tempoHoras: 3.5, insumoId: 'ins-1', embalagemId: 'ins-4', estoqueAcabado: 14, custoMaquinaHora: 2.50, margemAtacado: 120, margemVarejo: 250, imageUrl: 'src/assets/img/products/dragao-articulado-sensorial.svg' },
    { id: 'prod-2', nome: 'Dragao Imperial Multicolor Seda (30cm)', categoria: 'Animais 3D', pesoGramas: 180, tempoHoras: 7.0, insumoId: 'ins-2', embalagemId: 'ins-4', estoqueAcabado: 6, custoMaquinaHora: 2.50, margemAtacado: 140, margemVarejo: 280, imageUrl: 'src/assets/img/products/miniatura-rpg-dragao.svg' },
    { id: 'prod-3', nome: 'Axolote Flex de Mergulho (15cm)', categoria: 'Animais 3D', pesoGramas: 50, tempoHoras: 2.0, insumoId: 'ins-3', embalagemId: 'ins-4', estoqueAcabado: 22, custoMaquinaHora: 2.50, margemAtacado: 110, margemVarejo: 240, imageUrl: 'src/assets/img/products/polvo-humor-articulado.svg' },
    { id: 'prod-4', nome: 'Chaveiro Tatil Fidget Cubo Infinito', categoria: 'Chaveiros', pesoGramas: 25, tempoHoras: 1.0, insumoId: 'ins-1', embalagemId: 'ins-5', estoqueAcabado: 45, custoMaquinaHora: 2.00, margemAtacado: 150, margemVarejo: 300, imageUrl: 'src/assets/img/products/cubo-infinito-foco.svg' },
] satisfies Array<IProdutoFabril & { id: string }>;

const kardex = [
    { id: 'k-1', tipo: 'ENTRADA', subtipo: 'FABRICAÇÃO 3D', descricao: 'Fabricacao concluida - +5 un Dragao Articulado Sensorial (Consumo: -425g PLA Rosa)', valor: 85.00, quantidade: 5, referenciaId: 'prod-1' },
    { id: 'k-2', tipo: 'SAIDA', subtipo: 'VENDA VAREJO', descricao: 'Venda via WhatsApp Consultora Anne Terra - -2 un Axolote Flex de Mergulho', valor: 68.00, quantidade: 2, referenciaId: 'prod-3' },
    { id: 'k-3', tipo: 'ENTRADA', subtipo: 'COMPRA INSUMO', descricao: 'Reposicao de materia-prima - +3000g Filamento PLA Multicolor Seda', valor: 420.00, quantidade: 3000, referenciaId: 'ins-2' },
] satisfies Array<IKardex & { id: string }>;

await connectMongo();

let upsertedInsumos = 0;
for (const item of insumos) {
    const { id, ...data } = item;
    await mErp.findOneAndUpdate(
        { uuid: id },
        { $set: { uuid: id, appKey: APP_KEY, tipo: 'insumo', data, deletedAt: null } },
        { upsert: true, new: true, runValidators: true }
    );
    upsertedInsumos++;
}

let upsertedProdutos = 0;
for (const item of produtos) {
    const { id, ...baseData } = item;
    const precificacao = await calcularPrecificacao(APP_KEY, baseData);
    const data: IProdutoFabril = {
        ...baseData,
        custoMateriais: precificacao.custoMateriais,
        custoTotal: precificacao.custoTotal,
        precoAtacado: precificacao.precoAtacado,
        precoVarejo: precificacao.precoVarejo,
    };
    await mErp.findOneAndUpdate(
        { uuid: id },
        { $set: { uuid: id, appKey: APP_KEY, tipo: 'produto_fabril', data, deletedAt: null } },
        { upsert: true, new: true, runValidators: true }
    );
    upsertedProdutos++;
}

let upsertedKardex = 0;
for (const item of kardex) {
    const { id, ...data } = item;
    await mErp.findOneAndUpdate(
        { uuid: id },
        { $set: { uuid: id, appKey: APP_KEY, tipo: 'kardex', data, deletedAt: null } },
        { upsert: true, new: true, runValidators: true }
    );
    upsertedKardex++;
}

console.log(`Seed ERP BVA concluido: ${upsertedInsumos} insumo(s), ${upsertedProdutos} produto(s), ${upsertedKardex} kardex.`);
process.exit(0);
