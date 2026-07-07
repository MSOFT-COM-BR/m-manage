import mongoose, { Document, Schema } from 'mongoose';

export interface IProductVariant {
    name: string;
    sku?: string;
    price?: number;
    stock?: number;
    attrs?: Record<string, string>;
}

export interface IProductImage {
    url: string;
    alt?: string;
    isPrimary?: boolean;
}

export interface IProduct extends Document {
    uuid: string;
    appKey: string;
    name: string;
    slug: string;
    description?: string;
    shortDesc?: string;
    sku?: string;
    price: number;
    comparePrice?: number;
    currency: string;
    category?: string;
    tags: string[];
    status: 'draft' | 'active' | 'inactive' | 'archived';
    images: IProductImage[];
    variants: IProductVariant[];
    stock?: number;
    weight?: number;
    dimensions?: { width?: number; height?: number; depth?: number };
    meta?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
    {
        uuid: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
        },
        appKey: { type: String, required: true, index: true },
        name: { type: String, required: true },
        slug: { type: String, required: true },
        description: { type: String },
        shortDesc: { type: String },
        sku: { type: String },
        price: { type: Number, required: true, default: 0 },
        comparePrice: { type: Number },
        currency: { type: String, default: 'BRL' },
        category: { type: String },
        tags: { type: [String], default: [] },
        status: {
            type: String,
            enum: ['draft', 'active', 'inactive', 'archived'],
            default: 'draft',
        },
        images: {
            type: [
                {
                    url: { type: String, required: true },
                    alt: { type: String },
                    isPrimary: { type: Boolean, default: false },
                },
            ],
            default: [],
        },
        variants: {
            type: [
                {
                    name: { type: String, required: true },
                    sku: { type: String },
                    price: { type: Number },
                    stock: { type: Number },
                    attrs: { type: Schema.Types.Mixed },
                },
            ],
            default: [],
        },
        stock: { type: Number },
        weight: { type: Number },
        dimensions: {
            width: { type: Number },
            height: { type: Number },
            depth: { type: Number },
        },
        meta: { type: Schema.Types.Mixed },
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

// appKey + slug único por tenant
productSchema.index({ appKey: 1, slug: 1 }, { unique: true });
productSchema.index({ appKey: 1, category: 1 });
productSchema.index({ appKey: 1, status: 1 });
productSchema.index({ appKey: 1, tags: 1 });

export const mProduct = mongoose.model<IProduct>('mProduct', productSchema);
