'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart2, LayoutGrid, LogOut, Settings } from 'lucide-react';
import clsx from 'clsx';
import type { SafeUser } from '@/lib/auth';

export default function AppShell({ children, user }: { children: React.ReactNode; user: SafeUser }) {
    const pathname = usePathname();
    const router = useRouter();
    const navItems = [
        { name: 'Overview', href: '/dashboard', icon: LayoutGrid },
        { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart2 },
        { name: 'Settings', href: '/settings', icon: Settings },
    ];

    async function signOut() {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) router.replace('/login');
    }

    return <div className="min-h-screen bg-slate-50 dark:bg-[#0f1117] flex font-sans">
        <aside className="w-64 fixed h-full bg-white dark:bg-[#161822] border-r border-slate-200 dark:border-white/5 z-20 hidden md:flex flex-col">
            <div className="h-20 flex items-center px-8 border-b border-slate-100 dark:border-white/5">
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-violet-600 rounded-lg flex items-center justify-center mr-3"><span className="text-white font-bold">A</span></div>
                <span className="font-bold text-lg text-slate-900 dark:text-white">AdaptiveWeb</span>
            </div>
            <nav className="flex-1 py-8 px-4 space-y-2" aria-label="Dashboard">
                {navItems.map((item) => {
                    const active = pathname === item.href;
                    return <Link key={item.href} href={item.href} className={clsx(
                        'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors group',
                        active ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white',
                    )}>
                        <item.icon size={20} aria-hidden="true" />{item.name}
                    </Link>;
                })}
            </nav>
            <div className="p-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-3 p-3 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white font-bold" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</p><p className="text-xs text-slate-500 truncate">{user.email}</p></div>
                    <button onClick={signOut} className="p-2 text-slate-400 hover:text-red-500" aria-label="Sign out"><LogOut size={17} /></button>
                </div>
            </div>
        </aside>
        <main className="flex-1 md:ml-64 min-h-screen">{children}</main>
    </div>;
}
