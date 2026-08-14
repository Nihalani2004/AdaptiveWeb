import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IExtensionCredential extends Document {
    userId: Types.ObjectId;
    tokenHash?: string;
    pairingCodeHash?: string;
    label: string;
    pairingExpiresAt?: Date;
    tokenExpiresAt?: Date;
    pairedAt?: Date;
    lastUsedAt?: Date;
    revokedAt?: Date;
}

const ExtensionCredentialSchema = new Schema<IExtensionCredential>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, sparse: true, unique: true, index: true },
    pairingCodeHash: { type: String, sparse: true, unique: true, index: true },
    label: { type: String, default: 'AdaptiveWeb extension', maxlength: 100 },
    pairingExpiresAt: { type: Date },
    tokenExpiresAt: { type: Date },
    pairedAt: { type: Date },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
}, { timestamps: true });

export default mongoose.models.ExtensionCredential || mongoose.model<IExtensionCredential>('ExtensionCredential', ExtensionCredentialSchema);
