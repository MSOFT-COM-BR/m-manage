import mongoose, { Document, Schema } from 'mongoose';

export interface IBvaOrderItem {
    productId: string;
    sku?: string;
    name: string;
    category?: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
}

export interface IBvaOrderCustomer {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
}

export interface IBvaOrderReseller {
    id?: string;
    name?: string;
    whatsapp?: string;
    instagram?: string;
}

export interface IBvaOrder extends Document {
    code: string;
    appKey: string;
    channel: 'whatsapp';
    status: 'new' | 'sent_to_whatsapp' | 'confirmed' | 'delivered' | 'cancelled';
    currency: string;
    total: number;
    items: IBvaOrderItem[];
    customer?: IBvaOrderCustomer;
    reseller?: IBvaOrderReseller;
    whatsappTarget?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const bvaOrderSchema = new Schema<IBvaOrder>(
    {
        code: { type: String, required: true, unique: true, index: true },
        appKey: { type: String, required: true, index: true },
        channel: { type: String, enum: ['whatsapp'], default: 'whatsapp' },
        status: {
            type: String,
            enum: ['new', 'sent_to_whatsapp', 'confirmed', 'delivered', 'cancelled'],
            default: 'new',
            index: true,
        },
        currency: { type: String, default: 'BRL' },
        total: { type: Number, required: true, min: 0 },
        items: {
            type: [
                {
                    productId: { type: String, required: true },
                    sku: { type: String },
                    name: { type: String, required: true },
                    category: { type: String },
                    unitPrice: { type: Number, required: true, min: 0 },
                    quantity: { type: Number, required: true, min: 1 },
                    subtotal: { type: Number, required: true, min: 0 },
                },
            ],
            required: true,
            validate: [(items: IBvaOrderItem[]) => items.length > 0, 'Pedido sem itens'],
        },
        customer: {
            name: { type: String, trim: true },
            phone: { type: String, trim: true },
            email: { type: String, trim: true, lowercase: true },
            address: { type: String, trim: true },
            notes: { type: String, trim: true },
        },
        reseller: {
            id: { type: String },
            name: { type: String, trim: true },
            whatsapp: { type: String, trim: true },
            instagram: { type: String, trim: true },
        },
        whatsappTarget: { type: String, trim: true },
        source: { type: String, trim: true, default: 'm-bva:index' },
        metadata: { type: Schema.Types.Mixed },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'bva_orders',
        toJSON: {
            transform: (_, ret) => {
                delete ret._id;
                return ret;
            },
        },
    }
);

bvaOrderSchema.index({ appKey: 1, createdAt: -1 });
bvaOrderSchema.index({ appKey: 1, status: 1, createdAt: -1 });

export const mBvaOrder = mongoose.model<IBvaOrder>('mBvaOrder', bvaOrderSchema);
