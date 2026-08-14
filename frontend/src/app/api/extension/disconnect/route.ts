import { NextResponse } from 'next/server';
import { authenticateExtension, extensionHeaders } from '@/lib/extension-auth';
import dbConnect from '@/lib/db';
import ExtensionCredential from '@/models/ExtensionCredential';

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: extensionHeaders() }); }

export async function DELETE(request: Request) {
    const headers = extensionHeaders();
    const identity = await authenticateExtension(request);
    if (!identity) return NextResponse.json({ error: 'Pairing required.' }, { status: 401, headers });
    await dbConnect();
    await ExtensionCredential.updateOne({ _id: identity.credentialId }, { $set: { revokedAt: new Date() }, $unset: { tokenHash: 1 } });
    return NextResponse.json({ success: true }, { headers });
}
