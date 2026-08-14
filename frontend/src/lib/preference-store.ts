import type { SafeUser } from '@/lib/auth';
import dbConnect from '@/lib/db';
import {
    cloneDefaultPreferences,
    migrateLegacyPreferences,
    parsePreferences,
    type AdaptiveWebPreferences,
} from '@/lib/preferences';
import UserPreferences from '@/models/UserPreferences';

export interface PreferenceRecord {
    preferences: AdaptiveWebPreferences;
    revision: number;
    updatedAt: Date;
}

export async function getPreferenceRecord(user: SafeUser): Promise<PreferenceRecord> {
    await dbConnect();
    let doc = await UserPreferences.findOne({ userId: user.id });
    if (!doc) {
        // Legacy records are claimable only after login proves control of the email.
        doc = await UserPreferences.findOne({ userId: { $exists: false }, email: user.email });
        if (doc) {
            doc.userId = user.id;
            doc.preferences = migrateLegacyPreferences(doc.settings);
            doc.schemaVersion = 1;
            doc.revision = Math.max(1, doc.revision || 1);
            await doc.save();
        }
    }
    if (!doc) {
        doc = await UserPreferences.create({
            userId: user.id,
            email: user.email,
            schemaVersion: 1,
            revision: 1,
            preferences: cloneDefaultPreferences(),
        });
    }
    let preferences: AdaptiveWebPreferences;
    try {
        preferences = parsePreferences(doc.preferences);
    } catch {
        preferences = migrateLegacyPreferences(doc.settings);
        doc.preferences = preferences;
        doc.schemaVersion = 1;
        doc.revision = Math.max(1, doc.revision || 1);
        await doc.save();
    }
    return { preferences, revision: doc.revision || 1, updatedAt: doc.updatedAt || doc.createdAt };
}

export async function savePreferenceRecord(user: SafeUser, input: unknown, expectedRevision?: number): Promise<PreferenceRecord> {
    const preferences = parsePreferences(input);
    const current = await getPreferenceRecord(user);
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new Error('PREFERENCE_REVISION_CONFLICT');
    }
    const doc = await UserPreferences.findOneAndUpdate(
        { userId: user.id, ...(expectedRevision === undefined ? {} : { revision: expectedRevision }) },
        { $set: { email: user.email, schemaVersion: 1, preferences }, $inc: { revision: 1 } },
        { new: true },
    );
    if (!doc) throw new Error('PREFERENCE_REVISION_CONFLICT');
    return { preferences: parsePreferences(doc.preferences), revision: doc.revision, updatedAt: doc.updatedAt };
}
