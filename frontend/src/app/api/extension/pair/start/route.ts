import { NextResponse } from 'next/server';
import { getCurrentUser, hashOpaqueToken } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { createPairingCode, PAIRING_LIFETIME_MS, preferenceSyncEnabled } from '@/lib/extension-auth';
import { isSameOrigin, rateLimit } from '@/lib/security';
import ExtensionCredential from '@/models/ExtensionCredential';

export async function POST(request: Request) {
    if (!preferenceSyncEnabled()) return NextResponse.json({ error: 'Extension sync is temporarily unavailable.' }, { status: 503 });
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    if (!rateLimit(request, 'pair-start', 8, 10 * 60_000)) return NextResponse.json({ error: 'Too many pairing requests.' }, { status: 429 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    await dbConnect();
    await ExtensionCredential.deleteMany({ userId: user.id, pairedAt: { $exists: false } });
    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS);
    await ExtensionCredential.create({ userId: user.id, pairingCodeHash: hashOpaqueToken(code), pairingExpiresAt: expiresAt });
    return NextResponse.json({ code, expiresAt });
}
