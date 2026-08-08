import React from 'react';
import Link from 'next/link';
import { Download, LayoutGrid, LogIn } from 'lucide-react';

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col min-h-screen">
            {/* Premium Glass Navbar */}
            <nav className="fixed w-full z-50 bg-white/10 dark:bg-black/10 backdrop-blur-lg border-b border-white/20 dark:border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Premium Glass Custom Navbar */}
                    <nav className="fixed top-0 inset-x-0 z-50 px-6 py-4">
                        <div className="max-w-6xl mx-auto">
                            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl shadow-black/20">

                                {/* Logo area */}
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center">
                                        <span className="font-bold text-white text-xs">AW</span>
                                    </div>
                                    <span className="font-semibold text-white tracking-tight">AdaptiveWeb</span>
                                </div>

                                {/* Links */}
                                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
                                    <a href="#" className="hover:text-white transition-colors">Architecture</a>
                                    <a href="#features" className="hover:text-white transition-colors">Features</a>
                                    <a href="#demo" className="hover:text-white transition-colors">Live Demo</a>
                                </div>

                                {/* Action */}
                                <div className="flex items-center gap-4">
                                    <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
                                        Sign In
                                    </Link>
                                    <Link href="/dashboard" className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-full hover:bg-slate-200 transition-colors">
                                        Get Started
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </nav>
                </div>
            </nav>

            <main className="flex-grow pt-20">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-slate-800 py-12">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-slate-500 text-sm">© 2026 AdaptiveWeb. Crafted for intelligence.</p>
                </div>
            </footer>
        </div>
    );
}
