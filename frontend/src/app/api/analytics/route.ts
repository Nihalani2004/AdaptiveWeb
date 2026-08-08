import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Analytics from '@/models/Analytics';

export async function POST(request: Request) {
    try {
        await dbConnect();
        const body = await request.json();
        const event = await Analytics.create(body);
        return NextResponse.json({ success: true, data: event });
    } catch (error) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export async function GET() {
    try {
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
    } catch (error) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
