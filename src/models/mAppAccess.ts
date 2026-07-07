import { Schema, model, Document, Types } from 'mongoose';

export type AppAccessRole = 'owner' | 'editor' | 'viewer';

export interface IMAppAccess extends Document {
    uuid: string;
    userId: Types.ObjectId;
    appKey: string;
    role: AppAccessRole;
    grantedBy?: Types.ObjectId;
}

const mAppAccessSchema = new Schema<IMAppAccess>(
    {
        uuid: { type: String, default: () => crypto.randomUUID(), immutable: true },
        userId: { type: Schema.Types.ObjectId, ref: 'mAuth', required: true, index: true },
        appKey: { type: String, required: true, index: true },
        role: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer' },
        grantedBy: { type: Schema.Types.ObjectId, ref: 'mAuth' },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'mappaccess',
        toJSON: {
            transform(_doc, ret: any) {
                ret.id = ret._id;
                delete ret._id;
                return ret;
            }
        }
    }
);

mAppAccessSchema.index({ userId: 1, appKey: 1 }, { unique: true });

export const mAppAccess = model<IMAppAccess>('mAppAccess', mAppAccessSchema);
