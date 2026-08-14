'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertCircle } from 'lucide-react';

interface AnalyticsStats { total: number; byType: Array<{ _id: string; count: number }> }

export default function AnalyticsPage() {
    const [stats, setStats] = useState<AnalyticsStats | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        fetch('/api/analytics').then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load analytics.');
            setStats(data.stats);
        }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load analytics.'));
    }, []);
    return <div className="p-6 md:p-10 text-slate-900 dark:text-white">
        <header className="mb-8"><h1 className="text-3xl font-bold">Analytics</h1><p className="text-slate-500 mt-2">Aggregate assistance events recorded by AdaptiveWeb.</p></header>
        {error && <div role="alert" className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-700"><AlertCircle size={18} />{error}</div>}
        {!error && !stats && <p role="status" className="text-slate-500">Loading analytics…</p>}
        {stats && <><div className="bg-white dark:bg-[#161822] border border-slate-200 dark:border-white/5 rounded-2xl p-6 mb-7"><Activity className="text-blue-600 mb-3" /><p className="text-sm text-slate-500">Total recorded events</p><p className="text-4xl font-bold mt-1">{stats.total}</p></div><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{stats.byType.map((item) => <div key={item._id || 'unknown'} className="bg-white dark:bg-[#161822] border border-slate-200 dark:border-white/5 rounded-2xl p-5"><p className="text-sm text-slate-500 capitalize">{item._id || 'Unknown'}</p><p className="text-2xl font-bold mt-1">{item.count}</p></div>)}</div></>}
    </div>;
}
