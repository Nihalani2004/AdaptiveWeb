const attempts = new Map<string, { count: number; resetAt: number }>();

export function isSameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (!origin) return process.env.NODE_ENV !== 'production';
    return origin === new URL(request.url).origin;
}

export function rateLimit(request: Request, scope: string, limit = 10, windowMs = 60_000): boolean {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const key = `${scope}:${ip}`;
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    if (attempts.size > 5000) {
        for (const [candidate, value] of attempts) if (value.resetAt <= now) attempts.delete(candidate);
    }
    return true;
}
