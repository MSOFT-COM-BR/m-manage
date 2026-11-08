import { Schema, model, Document } from 'mongoose';

export type WebhookStatus = 'active' | 'paused' | 'disabled';

export interface IMWebhook extends Document {
    name: string;
    url: string;
    events: string[];
    status: WebhookStatus;
    secret?: string;
    headers?: Record<string, string>;
    failureCount: number;
    lastDispatchedAt?: Date;
    lastResponseStatus?: number;
    createdAt: Date;
    updatedAt: Date;
}

const mWebhookSchema = new Schema<IMWebhook>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 150
        },
        url: {
            type: String,
            required: true,
            trim: true
        },
        events: {
            type: [String],
            required: true,
            index: true,
            default: []
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'disabled'],
            default: 'active',
            index: true
        },
        secret: {
            type: String,
            trim: true
        },
        headers: {
            type: Schema.Types.Mixed,
            default: undefined
        },
        failureCount: {
            type: Number,
            default: 0
        },
        lastDispatchedAt: {
            type: Date
        },
        lastResponseStatus: {
            type: Number
        }
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'm_webhooks',
        toJSON: {
            transform: function (_doc, ret: any) {
                ret.id = ret._id;
                return ret;
            }
        }
    }
);

// Índice composto para otimizar busca de webhooks ativos por evento
mWebhookSchema.index({ status: 1, events: 1 });

export const mWebhook = model<IMWebhook>('mWebhook', mWebhookSchema);
