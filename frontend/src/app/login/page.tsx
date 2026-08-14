'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true); setError('');
        const data = new FormData(event.currentTarget);
        const payload = Object.fromEntries(data.entries());
        try {
            const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Authentication failed.');
            router.replace('/dashboard');
            router.refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Authentication failed.');
        } finally { setBusy(false); }
    }

    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f1117] p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-violet-500/20 blur-[120px] rounded-full" />
        <div className="w-full max-w-md p-8 bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl relative z-10">
            <Link href="/" className="block text-center mb-7 text-slate-700 dark:text-slate-200 font-bold">AdaptiveWeb</Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="text-slate-500 text-center mt-1 mb-7">Your settings stay attached to your verified account.</p>
            <form onSubmit={submit} className="space-y-4">
                {mode === 'register' && <label className="block text-sm text-slate-600 dark:text-slate-300">Name<input name="name" required minLength={2} maxLength={80} autoComplete="name" className="mt-1 w-full px-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" /></label>}
                <label className="block text-sm text-slate-600 dark:text-slate-300">Email<input name="email" type="email" required autoComplete="email" className="mt-1 w-full px-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" /></label>
                <label className="block text-sm text-slate-600 dark:text-slate-300">Password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-1 w-full px-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white" /></label>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button disabled={busy} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
            </form>
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="w-full mt-5 text-sm text-blue-600 hover:underline">{mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}</button>
        </div>
    </div>;
}
