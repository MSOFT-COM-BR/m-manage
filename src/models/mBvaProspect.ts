import mongoose, { Document, Schema } from 'mongoose';

export interface IBvaProspect extends Document {
    uuid: string;
    appKey: string;
    name: string;
    category: string;
    address?: string;
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    lat?: number;
    lng?: number;
    status: 'Novo Lead' | 'Contatado' | 'Em Negociação' | 'Parceiro';
    notes?: string;
    isAutoFetched?: boolean;
    source?: string;
    createdAt: Date;
    updatedAt: Date;
}

const bvaProspectSchema = new Schema<IBvaProspect>(
    {
        uuid: { type: String, required: true, unique: true, immutable: true },
        appKey: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true, index: true },
        address: { type: String, trim: true },
        phone: { type: String, trim: true },
        whatsapp: { type: String, trim: true },
        instagram: { type: String, trim: true },
        lat: { type: Number },
        lng: { type: Number },
        status: {
            type: String,
            enum: ['Novo Lead', 'Contatado', 'Em Negociação', 'Parceiro'],
            default: 'Novo Lead',
            index: true,
        },
        notes: { type: String, trim: true },
        isAutoFetched: { type: Boolean, default: false },
        source: { type: String, trim: true, default: 'm-bva:prospeccao' },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'bva_prospects',
        toJSON: {
            transform: (_, ret) => {
                delete ret._id;
                ret.id = ret.uuid;
                return ret;
            },
        },
    }
);

bvaProspectSchema.index({ appKey: 1, name: 1 });
bvaProspectSchema.index({ appKey: 1, category: 1, status: 1 });

export const mBvaProspect = mongoose.model<IBvaProspect>('mBvaProspect', bvaProspectSchema);
