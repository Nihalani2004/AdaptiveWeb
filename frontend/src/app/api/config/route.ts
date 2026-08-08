import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import UserPreferences from '@/models/UserPreferences';

export async function POST(request: Request) {
    try {
        await dbConnect();
        const body = await request.json();

        // In a real app, we'd validate the session/user.
        // For MVP Demo, we just upsert based on email or create new.
        const { email, settings } = body;

        if (!email) {
            return NextResponse.json({ success: false, error: 'Email required for demo save' }, { status: 400 });
        }

        const doc = await UserPreferences.findOneAndUpdate(
            { email },
            { settings },
            { new: true, upsert: true }
        );

        return NextResponse.json({ success: true, data: doc });
    } catch (error: any) {
        console.error('API Config Error:', error?.message || error);
        return NextResponse.json({ success: false, error: error?.message || 'Server Error' }, { status: 500 });
    }
}
