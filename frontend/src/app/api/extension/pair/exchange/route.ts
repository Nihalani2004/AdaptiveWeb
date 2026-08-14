import { NextResponse } from 'next/server';
import { hashOpaqueToken } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { createExtensionToken, EXTENSION_TOKEN_LIFETIME_MS, extensionHeaders, preferenceSyncEnabled } from '@/lib/extension-auth';
import { getPreferenceRecord } from '@/lib/preference-store';
import { rateLimit } from '@/lib/security';
import ExtensionCredential from '@/models/ExtensionCredential';
import User from '@/models/User';

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: extensionHeaders() }); }

export async function POST(request: Request) {
    const headers = extensionHeaders();
    if (!preferenceSyncEnabled()) return NextResponse.json({ error: 'Extension sync is temporarily unavailable.' }, { status: 503, headers });
    if (!rateLimit(request, 'pair-exchange', 12, 10 * 60_000)) return NextResponse.json({ error: 'Too many pairing attempts.' }, { status: 429, headers });
    try {
        const body = await request.json();
        const code = typeof body.code === 'string' ? body.code.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() : '';
        if (code.length !== 10) return NextResponse.json({ error: 'Enter the 10-character pairing code.' }, { status: 400, headers });
        await dbConnect();
        const token = createExtensionToken();
        const tokenExpiresAt = new Date(Date.now() + EXTENSION_TOKEN_LIFETIME_MS);
        const credential = await ExtensionCredential.findOneAndUpdate(
            { pairingCodeHash: hashOpaqueToken(code), pairingExpiresAt: { $gt: new Date() }, pairedAt: { $exists: false } },
            { $set: { tokenHash: hashOpaqueToken(token), tokenExpiresAt, pairedAt: new Date() }, $unset: { pairingCodeHash: 1, pairingExpiresAt: 1 } },
            { new: true },
        );
        if (!credential) return NextResponse.json({ error: 'This pairing code is invalid, expired, or already used.' }, { status: 400, headers });
        const userDoc = await User.findById(credential.userId).lean();
        if (!userDoc) return NextResponse.json({ error: 'The paired account no longer exists.' }, { status: 404, headers });
        const user = { id: String(userDoc._id), email: userDoc.email, name: userDoc.name };
        const record = await getPreferenceRecord(user);
        return NextResponse.json({ token, tokenExpiresAt, account: { email: user.email, name: user.name }, ...record }, { headers });
    } catch {
        return NextResponse.json({ error: 'Unable to pair the extension.' }, { status: 500, headers });
    }
}
