import { NextResponse } from 'next/server';
export async function POST() {
    return NextResponse.json(
        { error: 'This unsafe demo endpoint has been retired. Use the authenticated /api/preferences endpoint.' },
        { status: 410 },
    );
}
