import mongoose, { Schema, Document } from 'mongoose';

export interface IUserPreferences extends Document {
    email: string; // Just for identification in demo
    settings: {
        hoverDelay: number;
        scrollBackWindow: number;
        optimizeText: boolean;
    };
    createdAt: Date;
}

const UserPreferencesSchema: Schema = new Schema({
    email: { type: String, required: true },
    settings: {
        hoverDelay: { type: Number, default: 1500 },
        scrollBackWindow: { type: Number, default: 3000 },
        optimizeText: { type: Boolean, default: true },
    },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.UserPreferences || mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema);
