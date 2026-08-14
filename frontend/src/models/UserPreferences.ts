import mongoose, { Schema, Document, Types } from 'mongoose';
import type { AdaptiveWebPreferences } from '@/lib/preferences';

export interface IUserPreferences extends Document {
    userId?: Types.ObjectId;
    email: string;
    schemaVersion: number;
    revision: number;
    preferences?: AdaptiveWebPreferences;
    settings?: {
        hoverDelay: number;
        scrollBackWindow: number;
        optimizeText: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}

const UserPreferencesSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', sparse: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    schemaVersion: { type: Number, default: 1 },
    revision: { type: Number, default: 1 },
    preferences: { type: Schema.Types.Mixed },
    // Kept temporarily so an authenticated owner can claim an old demo record.
    settings: {
        hoverDelay: { type: Number, default: 1500 },
        scrollBackWindow: { type: Number, default: 3000 },
        optimizeText: { type: Boolean, default: true },
    },
}, { timestamps: true });

export default mongoose.models.UserPreferences || mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema);
