import { NextResponse } from 'next/server';
import { authenticateExtension, extensionHeaders, preferenceSyncEnabled } from '@/lib/extension-auth';
import { getPreferenceRecord } from '@/lib/preference-store';

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: extensionHeaders() }); }

export async function GET(request: Request) {
    const headers = extensionHeaders();
    if (!preferenceSyncEnabled()) return NextResponse.json({ error: 'Extension sync is temporarily unavailable.' }, { status: 503, headers });
    const identity = await authenticateExtension(request);
    if (!identity) return NextResponse.json({ error: 'Pairing required.' }, { status: 401, headers });
    const record = await getPreferenceRecord(identity.user);
    return NextResponse.json({ account: { email: identity.user.email, name: identity.user.name }, ...record }, { headers });
}
