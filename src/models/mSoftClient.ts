import mongoose, { Document, Schema } from 'mongoose';

export type MSoftClientPersonType = 'PF' | 'PJ';
export type MSoftClientStatus = 'active' | 'inactive';

export interface IMSoftClient extends Document {
    personType: MSoftClientPersonType;
    name: string;
    tradeName?: string;
    document?: string;
    email?: string;
    phone?: string;
    status: MSoftClientStatus;
    createdAt: Date;
    updatedAt: Date;
}

const schema = new Schema<IMSoftClient>({
    personType: { type: String, required: true, enum: ['PF', 'PJ'] },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    tradeName: { type: String, trim: true, maxlength: 160 },
    document: { type: String, trim: true, maxlength: 14 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
}, { timestamps: true, versionKey: false, collection: 'msoft_clients' });

schema.index({ document: 1 }, {
    unique: true,
    partialFilterExpression: { document: { $type: 'string' } },
});
schema.index({ updatedAt: -1, _id: -1 });

export const mSoftClient = mongoose.models.MSoftClient
    || mongoose.model<IMSoftClient>('MSoftClient', schema);
