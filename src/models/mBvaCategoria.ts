import mongoose, { Document, Schema } from 'mongoose';

export interface IBvaCategoria extends Document {
    uuid: string;
    appKey: string;
    nome: string;       // identificador / código (ex: "Sensorial", "Tecnico")
    label: string;      // nome exibido (ex: "✨ Sensorial & Tátil")
    ordem: number;      // ordem de exibição na vitrine e modais (1, 2, 3...)
    ativa: boolean;     // status de ativação (true = visível na vitrine e modais)
    observacoes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const bvaCategoriaSchema = new Schema<IBvaCategoria>(
    {
        uuid: { type: String, required: true, unique: true, immutable: true },
        appKey: { type: String, required: true, index: true },
        nome: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        ordem: { type: Number, default: 0 },
        ativa: { type: Boolean, default: true, index: true },
        observacoes: { type: String, trim: true },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'bva_categorias',
        toJSON: {
            transform: (_, ret) => {
                delete ret._id;
                ret.id = ret.uuid;
                return ret;
            },
        },
    }
);

bvaCategoriaSchema.index({ appKey: 1, nome: 1 }, { unique: true });
bvaCategoriaSchema.index({ appKey: 1, ativa: 1, ordem: 1 });

export const mBvaCategoria = mongoose.model<IBvaCategoria>('mBvaCategoria', bvaCategoriaSchema);
