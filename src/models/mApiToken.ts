import { Schema, model, Document } from 'mongoose';

export type ApiTokenStatus = 'active' | 'revoked';

/**
 * Interface que define o contrato de dados de um Token de API Unificado.
 */
export interface IApiToken extends Document {
    name: string;
    tokenHash: string;
    prefix: string;
    scopes: string[];
    status: ApiTokenStatus;
    expiresAt?: Date | null;
    lastUsedAt?: Date | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: any;
}

/**
 * Mongoose Schema para mApiToken.
 * 
 * Princípios de Segurança:
 * - Armazena apenas o hash criptográfico SHA-256 (`tokenHash`), NUNCA o token em texto claro.
 * - `tokenHash` possui `select: false` e é omitido na serialização toJSON para evitar vazamento acidental.
 * - `prefix` armazena os primeiros caracteres legíveis (ex: 'mgt_live_') para identificação visual sem comprometer o segredo.
 */
const mApiTokenSchema = new Schema<IApiToken>(
    {
        name: {
            type: String,
            required: [true, 'Nome do token é obrigatório'],
            trim: true,
            minlength: 2,
            maxlength: 120,
        },
        tokenHash: {
            type: String,
            required: [true, 'Hash SHA-256 do token é obrigatório'],
            unique: true,
            index: true,
            select: false,
        },
        prefix: {
            type: String,
            required: [true, 'Prefixo visual do token é obrigatório'],
            trim: true,
            index: true,
        },
        scopes: {
            type: [String],
            default: [],
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'revoked'],
            default: 'active',
            index: true,
        },
        expiresAt: {
            type: Date,
            default: null,
            index: true,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        createdBy: {
            type: String,
            required: [true, 'Identificador do usuário criador é obrigatório'],
            index: true,
            trim: true,
        },
    },
    {
        strict: true,
        timestamps: true,
        versionKey: false,
        collection: 'mapitoken',
        toJSON: {
            transform: function (_doc, ret: any) {
                ret.id = ret._id;
                delete ret._id;
                delete ret.tokenHash;
                return ret;
            },
        },
    }
);

// Índices compostos de alta performance para validação e consulta operacional
mApiTokenSchema.index({ tokenHash: 1, status: 1 });
mApiTokenSchema.index({ createdBy: 1, status: 1 });
mApiTokenSchema.index({ expiresAt: 1, status: 1 });

export const mApiToken = model<IApiToken>('mApiToken', mApiTokenSchema);
