import { randomBytes } from 'crypto';
import { hashOpaqueToken, type SafeUser } from '@/lib/auth';
import dbConnect from '@/lib/db';
import ExtensionCredential from '@/models/ExtensionCredential';
import User from '@/models/User';

export const PAIRING_LIFETIME_MS = 10 * 60_000;
export const EXTENSION_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60_000;

export function createPairingCode(): string {
    return randomBytes(5).toString('hex').toUpperCase();
}

export function createExtensionToken(): string {
    return randomBytes(32).toString('base64url');
}

export async function authenticateExtension(request: Request): Promise<{ user: SafeUser; credentialId: string } | null> {
    const authorization = request.headers.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/);
    if (!match) return null;
    await dbConnect();
    const credential = await ExtensionCredential.findOne({
        tokenHash: hashOpaqueToken(match[1]), revokedAt: { $exists: false }, tokenExpiresAt: { $gt: new Date() },
    });
    if (!credential) return null;
    const user = await User.findById(credential.userId).lean();
    if (!user) return null;
    credential.lastUsedAt = new Date();
    await credential.save();
    return { user: { id: String(user._id), email: user.email, name: user.name }, credentialId: String(credential._id) };
}

export function extensionHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Cache-Control': 'no-store',
    };
}

export function preferenceSyncEnabled(): boolean {
    return process.env.FEATURE_PREFERENCE_SYNC !== 'false';
}
