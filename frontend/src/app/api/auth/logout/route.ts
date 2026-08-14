import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { isSameOrigin } from '@/lib/security';

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    await destroySession();
    return NextResponse.json({ success: true });
}
