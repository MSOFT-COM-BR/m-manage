import mongoose, { Document, Schema } from 'mongoose';
import type { IProductImage } from './mProduct';

// ── Insumo (filamentos, embalagens, acessórios) ───────────────────────────────
export interface IInsumo {
    nome: string;
    unidade: 'g' | 'un' | 'ml' | 'm';
    qtyEstoque: number;           // estoque atual na unidade
    custoPorUnidade: number;      // R$ por unidade (grama, peça, ml, metro)
    estoqueMinimo: number;        // alerta de reposição
    fornecedor?: string;
    corHex?: string;              // identificação visual do filamento/insumo
    corNome?: string;             // nome amigável da cor (ex: Azul seda)
    imageUrl?: string;
    observacoes?: string;
}

// ── Produto Fabricado ─────────────────────────────────────────────────────────
export interface IProdutoAttachment {
    id: string;
    filename: string;
    originalName: string;
    url: string;
    size: number;
    mimeType: string;
    uploadedAt: string;
}

export type ProdutoVideoPlatform = 'youtube' | 'instagram' | 'tiktok';

export interface IProdutoVideo {
    url: string;                    // URL original informada pelo usuário
    platform: ProdutoVideoPlatform;
    embedUrl: string;                // URL pronta para <iframe src>
}

export interface IProdutoFabril {
    nome: string;
    categoria: string;
    pesoGramas: number;           // consumo de filamento por unidade
    tempoHoras: number;           // tempo de impressão
    insumoId: string;             // uuid do insumo principal (filamento)
    embalagemId?: string;         // uuid do insumo de embalagem
    acessoriosIds?: string[];     // outros insumos consumidos
    maquinaId?: string;           // uuid da máquina usada (registro tipo 'maquina')
    custoMaquinaHora: number;     // R$/h efetivo aplicado — snapshot no momento do cálculo (energia + depreciação da máquina selecionada, ou valor manual)
    margemAtacado: number;        // % sobre custo total
    margemVarejo: number;         // % sobre custo total
    estoqueAcabado: number;
    /** @deprecated migrado para `images`; mantido para compatibilidade de leitura de dados antigos */
    imageUrl?: string;
    images?: IProductImage[];
    videos?: IProdutoVideo[];
    attachments?: IProdutoAttachment[];
    observacoes?: string;
    visivelNaVitrine?: boolean;   // false = cadastrado só no ERP, não aparece na loja pública (default true)
    articulado?: boolean;         // true = exibe o badge "100% Articulado" na vitrine (default false)
    // campos calculados (persistidos para histórico)
    custoMateriais?: number;
    custoTotal?: number;
    precoAtacado?: number;
    precoVarejo?: number;
}

// ── Máquina (impressora 3D) ─────────────────────────────────────────────────────
export interface IMaquina {
    nome: string;                   // ex: "Ender 3 V2", "Bambu Lab P1S"
    potenciaWatts: number;          // consumo em uso
    custoDepreciacaoHora: number;   // R$/h — depreciação/manutenção amortizada
    custoMaquinaHora: number;       // valor final aplicado (calculado a partir da energia global + depreciação, ou sobrescrito manualmente)
    observacoes?: string;
}

// ── Configuração de fabricação (singleton por tenant) ──────────────────────────
export interface IErpConfigRedesSociais {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    youtube?: string;
}

export interface IErpConfig {
    custoEnergiaKwh: number;        // R$ por kWh — tarifa única da concessionária, compartilhada por todas as máquinas
    whatsappPrincipal?: string;     // número (DDI+DDD+número, só dígitos) que recebe os pedidos por padrão na vitrine
    redesSociais?: IErpConfigRedesSociais;
}

// ── Kardex (ledger imutável de movimentações) ─────────────────────────────────
export type KardexTipoMovimento = 'ENTRADA' | 'SAIDA' | 'AJUSTE';
export type KardexSubtipo =
    | 'FABRICAÇÃO 3D'
    | 'VENDA VAREJO'
    | 'VENDA ATACADO'
    | 'COMPRA INSUMO'
    | 'AJUSTE ESTOQUE'
    | 'DEVOLUÇÃO'
    | 'PERDA';

export interface IKardex {
    tipo: KardexTipoMovimento;
    subtipo: KardexSubtipo;
    descricao: string;
    valor: number;                // valor financeiro do movimento
    quantidade?: number;          // unidades movimentadas
    referenciaId?: string;        // uuid do produto ou insumo relacionado
    operadorEmail?: string;       // quem registrou
}

// ── Schema unificado ──────────────────────────────────────────────────────────
export type ErpTipo = 'insumo' | 'produto_fabril' | 'kardex' | 'config' | 'maquina';

export interface IErp extends Document {
    uuid: string;
    appKey: string;
    tipo: ErpTipo;
    data: IInsumo | IProdutoFabril | IKardex | IErpConfig | IMaquina;
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const erpSchema = new Schema<IErp>(
    {
        uuid: { type: String, required: true, unique: true, immutable: true },
        appKey: { type: String, required: true, index: true },
        tipo: {
            type: String,
            required: true,
            enum: ['insumo', 'produto_fabril', 'kardex', 'config', 'maquina'],
            index: true,
        },
        data: { type: Schema.Types.Mixed, required: true },
        deletedAt: { type: Date, default: null, index: true },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_, ret) => {
                delete ret._id;
                return ret;
            },
        },
    }
);

erpSchema.index({ appKey: 1, tipo: 1 });

export const mErp = mongoose.model<IErp>('mErp', erpSchema);
