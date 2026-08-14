'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Activity, Eye, MousePointer2, type LucideIcon } from 'lucide-react';

// Mock Data for Charts (since we might not have real data yet)
const ACTIVITY_DATA = [40, 60, 45, 80, 55, 90, 70];

export default function DashboardPage() {
    const [stats, setStats] = useState<{ total: number; byType: Array<{ _id: string; count: number }> } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        // Fetch stats from API
        fetch('/api/analytics')
            .then(res => {
                if (!res.ok) throw new Error('Unable to load dashboard analytics.');
                return res.json();
            })
            .then(data => {
                if (data.success) setStats(data.stats);
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Unable to load analytics.'));
    }, []);

    return (
        <div className="p-8">
            {/* Header */}
            <header className="mb-10">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Overview</h1>
                <p className="text-slate-500 dark:text-slate-400">Here&apos;s how AdaptiveWeb is performing.</p>
                {error && <p role="alert" className="text-red-600 mt-2">{error}</p>}
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <StatCard
                    title="Total Adaptations"
                    value={stats?.total ?? 0}
                    trend="+12.5%"
                    icon={Activity}
                    color="blue"
                />
                <StatCard
                    title="Active Users"
                    value="842"
                    trend="+5.2%"
                    icon={Users}
                    color="violet"
                />
                <StatCard
                    title="Hover Events"
                    value={stats?.byType?.find((event) => event._id === 'hover')?.count ?? 0}
                    trend="+8.1%"
                    icon={Eye}
                    color="orange"
                />
                <StatCard
                    title="Hesitation Solved"
                    value={stats?.byType?.find((event) => event._id === 'hesitation')?.count ?? 0}
                    trend="+2.4%"
                    icon={MousePointer2}
                    color="pink"
                />
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Chart Section */}
                <div className="lg:col-span-2 bg-white dark:bg-[#161822] rounded-2xl p-6 border border-slate-100 dark:border-white/5 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Activity Trends</h3>
                        <select className="bg-slate-50 dark:bg-white/5 border-none rounded-lg text-sm px-3 py-1 text-slate-500 dark:text-slate-400 focus:outline-none">
                            <option>Last 7 Days</option>
                            <option>Last 30 Days</option>
                        </select>
                    </div>

                    {/* Custom CSS Chart for Aesthetics */}
                    <div className="h-64 flex items-end justify-between gap-2">
                        {ACTIVITY_DATA.map((h, i) => (
                            <div key={i} className="w-full bg-slate-100 dark:bg-white/5 rounded-t-xl relative group overflow-hidden">
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ duration: 1, delay: i * 0.1 }}
                                    className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-violet-500 dark:from-blue-500 dark:to-violet-400 opacity-80 group-hover:opacity-100 transition-opacity"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-4 px-2">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                    </div>
                </div>

                {/* Recent Events / Quick Actions */}
                <div className="bg-white dark:bg-[#161822] rounded-2xl p-6 border border-slate-100 dark:border-white/5 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Live Feed</h3>
                    <div className="space-y-6">
                        {[1, 2, 3, 4, 5].map((_, i) => (
                            <div key={i} className="flex items-start gap-4">
                                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                <div>
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Hover Detection Triggered</p>
                                    <p className="text-xs text-slate-400">2 minutes ago • example.com</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-8 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        View All Activity
                    </button>
                </div>
            </div>
        </div>
    );
}

interface StatCardProps { title: string; value: string | number; trend: string; icon: LucideIcon; color: 'blue' | 'violet' | 'orange' | 'pink' }

function StatCard({ title, value, trend, icon: Icon, color }: StatCardProps) {
    const colors: Record<StatCardProps['color'], string> = {
        blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
        violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
        orange: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10",
        pink: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10",
    };

    return (
        <div className="bg-white dark:bg-[#161822] rounded-2xl p-6 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${colors[color]}`}>
                    <Icon size={22} />
                </div>
                <span className="flex items-center text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full">
                    <TrendingUp size={12} className="mr-1" /> {trend}
                </span>
            </div>
            <div>
                <h4 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</h4>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
}
