'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, RefreshCw, Save, Unplug } from 'lucide-react';
import type { AdaptiveWebPreferences } from '@/lib/preferences';

interface Connection { id: string; label: string; pairedAt: string; lastUsedAt?: string; expiresAt: string }

export default function SettingsPage() {
    const [preferences, setPreferences] = useState<AdaptiveWebPreferences | null>(null);
    const [revision, setRevision] = useState(0);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [pairCode, setPairCode] = useState('');
    const [pairExpiry, setPairExpiry] = useState('');
    const [status, setStatus] = useState('Loading preferences…');
    const [busy, setBusy] = useState(false);

    async function load() {
        setStatus('Loading preferences…');
        try {
            const [preferenceResponse, connectionResponse] = await Promise.all([fetch('/api/preferences'), fetch('/api/extension/status')]);
            const preferenceData = await preferenceResponse.json();
            if (!preferenceResponse.ok) throw new Error(preferenceData.error || 'Unable to load preferences.');
            setPreferences(preferenceData.preferences); setRevision(preferenceData.revision);
            if (connectionResponse.ok) setConnections((await connectionResponse.json()).connections || []);
            setStatus('Preferences are up to date.');
        } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to load preferences.'); }
    }

    useEffect(() => { void load(); }, []);

    function update(mutator: (draft: AdaptiveWebPreferences) => void) {
        setPreferences((current) => {
            if (!current) return current;
            const draft = structuredClone(current); mutator(draft); return draft;
        });
    }

    async function save() {
        if (!preferences) return;
        setBusy(true); setStatus('Saving…');
        try {
            const response = await fetch('/api/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences, revision }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to save preferences.');
            setPreferences(data.preferences); setRevision(data.revision); setStatus('Saved. The extension will receive these settings on its next sync.');
        } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to save preferences.'); }
        finally { setBusy(false); }
    }

    async function createPairingCode() {
        setBusy(true); setStatus('Creating a secure pairing code…');
        try {
            const response = await fetch('/api/extension/pair/start', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to create pairing code.');
            setPairCode(data.code); setPairExpiry(data.expiresAt); setStatus('Enter this one-time code in the extension options page.');
        } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to create pairing code.'); }
        finally { setBusy(false); }
    }

    async function disconnectAll() {
        setBusy(true);
        try {
            const response = await fetch('/api/extension/status', { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to disconnect extensions.');
            setConnections([]); setPairCode(''); setStatus('All extensions were disconnected.');
        } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to disconnect extensions.'); }
        finally { setBusy(false); }
    }

    if (!preferences) return <div className="p-8 text-slate-600 dark:text-slate-300" role="status">{status}</div>;

    const toggles: Array<[string, string, boolean, (enabled: boolean) => void]> = [
        ['Hover assistance', 'Offer help after dwelling on content.', preferences.features.hoverAssistance.enabled, (v) => update((p) => { p.features.hoverAssistance.enabled = v; })],
        ['Reading assistance', 'Detect repeatedly revisited difficult paragraphs.', preferences.features.readingAssistance.enabled, (v) => update((p) => { p.features.readingAssistance.enabled = v; })],
        ['Scroll-back summaries', 'Summarize visited content after a deep return scroll.', preferences.features.scrollBackSummary.enabled, (v) => update((p) => { p.features.scrollBackSummary.enabled = v; })],
        ['Cursor assistance', 'Offer contextual actions when hesitation is detected.', preferences.features.cursorAssistance.enabled, (v) => update((p) => { p.features.cursorAssistance.enabled = v; })],
        ['Keyboard shortcuts', 'Show and execute supported website shortcuts.', preferences.features.keyboardShortcuts.enabled, (v) => update((p) => { p.features.keyboardShortcuts.enabled = v; })],
        ['Exit assistance', 'Offer help when the cursor indicates an intent to leave.', preferences.features.exitIntent.enabled, (v) => update((p) => { p.features.exitIntent.enabled = v; })],
        ['Gemini assistance', 'Allow bounded page context to be sent to the configured Gemini backend.', preferences.ai.allowGemini, (v) => update((p) => { p.ai.allowGemini = v; })],
    ];

    return <div className="max-w-5xl p-6 md:p-10 text-slate-900 dark:text-white">
        <header className="mb-8"><h1 className="text-3xl font-bold">Settings</h1><p className="text-slate-500 mt-2">Control each adaptation and securely sync it to the browser extension.</p></header>
        <section className="bg-white dark:bg-[#161822] border border-slate-200 dark:border-white/5 rounded-2xl p-6 mb-7">
            <h2 className="text-xl font-bold mb-5">Behavior assistance</h2>
            <div className="divide-y divide-slate-100 dark:divide-white/5">{toggles.map(([title, description, checked, setter]) => <label key={title} className="flex gap-4 justify-between py-4 cursor-pointer"><span><span className="font-semibold block">{title}</span><span className="text-sm text-slate-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} className="h-5 w-5 accent-blue-600" /></label>)}</div>
            <div className="grid md:grid-cols-3 gap-5 mt-6">
                <label className="text-sm">Hover delay (ms)<input type="number" min={500} max={10000} step={100} value={preferences.features.hoverAssistance.delayMs} onChange={(e) => update((p) => { p.features.hoverAssistance.delayMs = Number(e.target.value); })} className="block mt-2 w-full p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent" /></label>
                <label className="text-sm">Scroll return window (ms)<input type="number" min={5000} max={60000} step={1000} value={preferences.features.scrollBackSummary.returnWindowMs} onChange={(e) => update((p) => { p.features.scrollBackSummary.returnWindowMs = Number(e.target.value); })} className="block mt-2 w-full p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent" /></label>
                <label className="text-sm">Compact reading<select value={preferences.features.compactReading.mode} onChange={(e) => update((p) => { p.features.compactReading.mode = e.target.value as 'ask' | 'automatic' | 'off'; })} className="block mt-2 w-full p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"><option value="ask">Ask first</option><option value="automatic">Automatic</option><option value="off">Off</option></select></label>
                <label className="text-sm">Motion<select value={preferences.accessibility.reducedMotion} onChange={(e) => update((p) => { p.accessibility.reducedMotion = e.target.value as 'system' | 'reduce' | 'full'; })} className="block mt-2 w-full p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent"><option value="system">Use system setting</option><option value="reduce">Reduce motion</option><option value="full">Full motion</option></select></label>
            </div>
            <button onClick={save} disabled={busy} className="mt-7 inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-60"><Save size={18} />Save preferences</button>
        </section>
        <section className="bg-white dark:bg-[#161822] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
            <div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-bold">Extension connection</h2><p className="text-sm text-slate-500 mt-1">Pair without exposing your password or browser token to web pages.</p></div><button onClick={createPairingCode} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-600 rounded-xl"><Link2 size={17} />Generate code</button></div>
            {pairCode && <div className="my-5 p-5 rounded-xl bg-blue-50 dark:bg-blue-500/10"><p className="text-sm text-slate-500">One-time pairing code</p><p className="font-mono text-3xl tracking-widest font-bold my-2">{pairCode}</p><p className="text-xs text-slate-500">Expires {new Date(pairExpiry).toLocaleString()} and can be used once.</p></div>}
            <div className="mt-5 space-y-3">{connections.length ? connections.map((connection) => <div key={connection.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5"><CheckCircle2 className="text-emerald-500" size={19} /><div><p className="font-medium">{connection.label}</p><p className="text-xs text-slate-500">Paired {new Date(connection.pairedAt).toLocaleString()}{connection.lastUsedAt ? ` · Last sync ${new Date(connection.lastUsedAt).toLocaleString()}` : ''}</p></div></div>) : <p className="text-sm text-slate-500">No active extension connection.</p>}</div>
            <div className="flex gap-3 mt-5"><button onClick={load} className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><RefreshCw size={16} />Refresh status</button>{connections.length > 0 && <button onClick={disconnectAll} disabled={busy} className="inline-flex items-center gap-2 text-sm text-red-600"><Unplug size={16} />Disconnect all</button>}</div>
        </section>
        <p role="status" aria-live="polite" className="mt-5 text-sm text-slate-500">{status}</p>
    </div>;
}
