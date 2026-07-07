import { Schema, model, Document } from 'mongoose';

/**
 * Interface for mAuth (User/Authentication)
 */
export interface IMAuth extends Document {
    name: string;
    email: string;
    password?: string;
    roles: string[];
    status: 'active' | 'inactive';
    provider?: string;
    avatar?: string;
    lastLogin?: Date;
    access_token?: string;
    refreshToken?: string;
    tokenVersion: number;
    [key: string]: any;
}

/**
 * Mongoose Schema for mAuth
 */
const mAuthSchema = new Schema<IMAuth>(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, index: true },
        password: { type: String, select: false }, // Don't return password by default
        roles: {
            type: [String],
            enum: ['admin', 'user', 'premium'],
            default: ['user']
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        },
        access_token: { type: String, unique: true, sparse: true },
        refreshToken: { type: String, select: false },
        tokenVersion: { type: Number, default: 0 },
        provider: { type: String, default: 'local' },
        avatar: { type: String },
        lastLogin: { type: Date }
    },
    {
        strict: false,
        timestamps: true,
        versionKey: false,
        collection: 'mauth',
        toJSON: {
            transform: function (_doc, ret: any) {
                ret.id = ret._id;
                delete ret._id;
                delete ret.password;
                delete ret.refreshToken;
                ret.role = (ret.roles && ret.roles.length > 0) ? ret.roles[0] : 'user';
                return ret;
            },
        },
    }
);

// Hash password before saving (placeholder logic, actual hashing usually in controller or pre-save hook)
// For now, simpler implementation.

export const mAuth = model<IMAuth>('mAuth', mAuthSchema);
