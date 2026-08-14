import { NextResponse } from 'next/server';
import { createSession, normalizeEmail, verifyPassword } from '@/lib/auth';
import dbConnect from '@/lib/db';
import { isSameOrigin, rateLimit } from '@/lib/security';
import User from '@/models/User';

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    if (!rateLimit(request, 'login', 10, 15 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    try {
        const body = await request.json();
        const email = normalizeEmail(body.email);
        const password = typeof body.password === 'string' ? body.password : '';
        await dbConnect();
        const user = await User.findOne({ email }).select('+passwordHash +passwordSalt');
        if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
            return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
        }
        await createSession(String(user._id));
        return NextResponse.json({ user: { id: String(user._id), email: user.email, name: user.name } });
    } catch (error) {
        const message = error instanceof Error && error.message.includes('valid') ? error.message : 'Unable to sign in.';
        return NextResponse.json({ error: message }, { status: message.includes('valid') ? 400 : 500 });
    }
}
