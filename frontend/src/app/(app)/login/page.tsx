'use client';

import Link from 'next/link';

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f1117] relative overflow-hidden">

            {/* Background Blobs */}
            <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-violet-500/20 blur-[120px] rounded-full" />

            <div className="w-full max-w-md p-8 bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-violet-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
                        <span className="text-white font-bold text-xl">A</span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome Back</h1>
                    <p className="text-slate-500 dark:text-slate-400">Sign in to your intelligent workspace.</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Email</label>
                        <input type="email" placeholder="mayank@adaptiveweb.ai" className="w-full px-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 dark:text-white transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label>
                        <input type="password" placeholder="••••••••" className="w-full px-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 dark:text-white transition-all" />
                    </div>

                    <Link href="/dashboard" className="block w-full text-center py-4 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all">
                        Sign In
                    </Link>

                    <p className="text-center text-sm text-slate-500">
                        Don't have an account? <a href="#" className="text-blue-600 hover:underline">Get started</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
