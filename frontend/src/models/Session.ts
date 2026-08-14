import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserSession extends Document {
    userId: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
}

const SessionSchema = new Schema<IUserSession>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.models.UserSession || mongoose.model<IUserSession>('UserSession', SessionSchema);
