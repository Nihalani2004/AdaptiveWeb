'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, BarChart2, Settings, User, LogOut, Zap } from 'lucide-react';
import clsx from 'clsx';

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const navItems = [
        { name: 'Overview', href: '/dashboard', icon: LayoutGrid },
        { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart2 },
        { name: 'Settings', href: '/settings', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0f1117] flex font-sans">

            {/* Sidebar */}
            <aside className="w-64 fixed h-full bg-white dark:bg-[#161822] border-r border-slate-200 dark:border-white/5 z-20 hidden md:flex flex-col">
                {/* Logo Area */}
                <div className="h-20 flex items-center px-8 border-b border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-violet-600 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-white font-bold">A</span>
                    </div>
                    <span className="font-bold text-lg text-slate-900 dark:text-white">AdaptiveWeb</span>
                </div>

                {/* Nav Links */}
                <div className="flex-1 py-8 px-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                                    isActive
                                        ? "bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400 font-medium"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <item.icon size={20} className={clsx(isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-white")} />
                                {item.name}
                            </Link>
                        );
                    })}
                </div>

                {/* User Profile Teaser */}
                <div className="p-4 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white font-bold">
                            M
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Mayank Nihalani</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Pro Plan</p>
                        </div>
                        <LogOut size={16} className="text-slate-400 hover:text-red-500 transition-colors" />
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 min-h-screen">
                {children}
            </main>

        </div>
    );
}
