import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPreferenceRecord, savePreferenceRecord } from '@/lib/preference-store';
import { PreferenceValidationError } from '@/lib/preferences';
import { isSameOrigin } from '@/lib/security';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const record = await getPreferenceRecord(user);
    return NextResponse.json(record);
}

export async function PATCH(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    try {
        const body = await request.json();
        const revision = body.revision === undefined ? undefined : Number(body.revision);
        if (revision !== undefined && !Number.isInteger(revision)) return NextResponse.json({ error: 'revision must be an integer.' }, { status: 400 });
        const record = await savePreferenceRecord(user, body.preferences, revision);
        return NextResponse.json(record);
    } catch (error) {
        if (error instanceof PreferenceValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
        if (error instanceof Error && error.message === 'PREFERENCE_REVISION_CONFLICT') {
            return NextResponse.json({ error: 'Preferences changed in another session. Reload and try again.' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Unable to save preferences.' }, { status: 500 });
    }
}
