import mongoose, { Schema, Document } from 'mongoose';

export interface IAnalytics extends Document {
    eventType: 'hover' | 'scroll_back' | 'skim' | 'hesitation';
    domain: string;
    timestamp: Date;
    metadata?: any;
}

const AnalyticsSchema: Schema = new Schema({
    eventType: { type: String, required: true },
    domain: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
});

export default mongoose.models.Analytics || mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
