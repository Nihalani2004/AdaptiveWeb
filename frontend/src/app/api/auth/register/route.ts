import { NextResponse } from 'next/server';
import { createPasswordRecord, createSession, normalizeEmail, validateName, validatePassword } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { getPreferenceRecord } from '@/lib/preference-store';
import { isSameOrigin, rateLimit } from '@/lib/security';
import User from '@/models/User';

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    if (!rateLimit(request, 'register', 5, 15 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    try {
        const body = await request.json();
        const email = normalizeEmail(body.email);
        const name = validateName(body.name);
        const password = validatePassword(body.password);
        await dbConnect();
        if (await User.exists({ email })) return NextResponse.json({ error: 'An account already exists for this email.' }, { status: 409 });
        const passwordRecord = createPasswordRecord(password);
        const user = await User.create({ email, name, passwordHash: passwordRecord.hash, passwordSalt: passwordRecord.salt });
        const safeUser = { id: String(user._id), email: user.email, name: user.name };
        await getPreferenceRecord(safeUser);
        await createSession(safeUser.id);
        return NextResponse.json({ user: safeUser }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create account.';
        return NextResponse.json({ error: message }, { status: message.includes('valid') || message.includes('must') ? 400 : 500 });
    }
}
