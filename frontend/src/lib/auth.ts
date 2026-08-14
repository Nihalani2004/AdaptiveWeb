import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import UserSession from '@/models/Session';

export const SESSION_COOKIE = 'aw_session';
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface SafeUser {
    id: string;
    email: string;
    name: string;
}

export function normalizeEmail(value: unknown): string {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw new Error('Enter a valid email address.');
    }
    return email;
}

export function validateName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name.length < 2 || name.length > 80) throw new Error('Name must be between 2 and 80 characters.');
    return name;
}

export function validatePassword(value: unknown): string {
    const password = typeof value === 'string' ? value : '';
    if (password.length < 10 || password.length > 128) {
        throw new Error('Password must be between 10 and 128 characters.');
    }
    return password;
}

export function createPasswordRecord(password: string) {
    const salt = randomBytes(16).toString('hex');
    return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<void> {
    await dbConnect();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await UserSession.create({ userId, tokenHash: hashOpaqueToken(token), expiresAt });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        expires: expiresAt,
    });
}

export async function getCurrentUser(): Promise<SafeUser | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    await dbConnect();
    const session = await UserSession.findOne({
        tokenHash: hashOpaqueToken(token),
        expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) return null;
    const user = await User.findById(session.userId).lean();
    if (!user) return null;
    return { id: String(user._id), email: user.email, name: user.name };
}

export async function destroySession(): Promise<void> {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) {
        await dbConnect();
        await UserSession.deleteOne({ tokenHash: hashOpaqueToken(token) });
    }
    jar.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
}
