import mongoose, { Document, Schema } from 'mongoose';

// ── Insumo (filamentos, embalagens, acessórios) ───────────────────────────────
export interface IInsumo {
    nome: string;
    unidade: 'g' | 'un' | 'ml' | 'm';
    qtyEstoque: number;           // estoque atual na unidade
    custoPorUnidade: number;      // R$ por unidade (grama, peça, ml, metro)
    estoqueMinimo: number;        // alerta de reposição
    fornecedor?: string;
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

export interface IProdutoFabril {
    nome: string;
    categoria: string;
    pesoGramas: number;           // consumo de filamento por unidade
    tempoHoras: number;           // tempo de impressão
    insumoId: string;             // uuid do insumo principal (filamento)
    embalagemId?: string;         // uuid do insumo de embalagem
    acessoriosIds?: string[];     // outros insumos consumidos
    custoMaquinaHora: number;     // R$/h (energia + depreciação)
    margemAtacado: number;        // % sobre custo total
    margemVarejo: number;         // % sobre custo total
    estoqueAcabado: number;
    imageUrl?: string;
    attachments?: IProdutoAttachment[];
    observacoes?: string;
    // campos calculados (persistidos para histórico)
    custoMateriais?: number;
    custoTotal?: number;
    precoAtacado?: number;
    precoVarejo?: number;
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
export type ErpTipo = 'insumo' | 'produto_fabril' | 'kardex';

export interface IErp extends Document {
    uuid: string;
    appKey: string;
    tipo: ErpTipo;
    data: IInsumo | IProdutoFabril | IKardex;
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
            enum: ['insumo', 'produto_fabril', 'kardex'],
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
