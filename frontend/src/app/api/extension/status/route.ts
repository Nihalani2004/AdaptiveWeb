import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { isSameOrigin } from '@/lib/security';
import ExtensionCredential from '@/models/ExtensionCredential';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    await dbConnect();
    const credentials = await ExtensionCredential.find({ userId: user.id, pairedAt: { $exists: true }, revokedAt: { $exists: false }, tokenExpiresAt: { $gt: new Date() } })
        .select('label pairedAt lastUsedAt tokenExpiresAt').sort({ pairedAt: -1 }).lean();
    return NextResponse.json({ connections: credentials.map((item) => ({ id: String(item._id), label: item.label, pairedAt: item.pairedAt, lastUsedAt: item.lastUsedAt, expiresAt: item.tokenExpiresAt })) });
}

export async function DELETE(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    await dbConnect();
    await ExtensionCredential.updateMany({ userId: user.id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() }, $unset: { tokenHash: 1, pairingCodeHash: 1 } });
    return NextResponse.json({ success: true });
}
