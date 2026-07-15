import mongoose, { Document, Schema } from 'mongoose';

export interface IBvaCatalogAccess extends Document {
    appKey: string;
    resellerId?: string;
    resellerName?: string;
    createdAt: Date;
}

const bvaCatalogAccessSchema = new Schema<IBvaCatalogAccess>(
    {
        appKey: { type: String, required: true, index: true },
        resellerId: { type: String, index: true },
        resellerName: { type: String },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
        collection: 'bva_catalog_access',
    }
);

bvaCatalogAccessSchema.index({ appKey: 1, resellerId: 1, createdAt: -1 });

export const mBvaCatalogAccess = mongoose.model<IBvaCatalogAccess>('mBvaCatalogAccess', bvaCatalogAccessSchema);
