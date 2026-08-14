import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Analytics from '@/models/Analytics';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        await dbConnect();
        const body = await request.json();
        const event = await Analytics.create(body);
        return NextResponse.json({ success: true, data: event });
    } catch {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
        await dbConnect();
        // Aggregation for Dashboard Charts

        // 1. Total Events count
        const totalEvents = await Analytics.countDocuments();

        // 2. Events by Type
        const byType = await Analytics.aggregate([
            { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ]);

        // 3. Activity over time (Last 7 days simple view)
        // For demo, just returning raw counts or simple data

        return NextResponse.json({
            success: true,
            stats: {
                total: totalEvents,
                byType
            }
        });
    } catch {
        return NextResponse.json({ success: false, error: 'Unable to load analytics.' }, { status: 500 });
    }
}
