'use client';

import React, { useState } from 'react';
import { MousePointer2, Scroll, Eye, Zap } from 'lucide-react';

const scrollDemoSections = [
  ['Intent signals', 'AdaptiveWeb observes interaction patterns such as scroll direction, distance, speed, and reversals. A single fast wheel event is not enough to trigger help. The extension waits for a meaningful journey through the content so ordinary navigation does not cause an interruption.'],
  ['Deep-reading threshold', 'The detector measures progress against the actual scrollable range. It considers the journey deep only after the reader reaches most of the document or scrollable panel, which distinguishes a quick glance at the opening from a genuine skim through the material.'],
  ['Bottom confirmation', 'Reaching the lower portion of the content arms the scroll-back detector. The extension records the maximum depth, downward travel, and timing locally. It does not need to record raw mouse coordinates or a replay of the browsing session.'],
  ['Direction reversal', 'After reaching the bottom region, an upward movement starts a return window. Small corrections are tolerated, but the reader must travel a substantial distance toward the beginning before the extension treats the gesture as a deliberate scroll-back.'],
  ['Skimming confidence', 'Scroll speed is only one part of the decision. AdaptiveWeb combines several fast samples with total travel and gesture duration. This reduces false positives caused by touchpad noise, layout shifts, or a user moving only a few pixels.'],
  ['Visited content', 'While the user scrolls, the extension samples visible headings, paragraphs, and list items. Duplicate snippets are removed, sensitive patterns such as email addresses and long numbers are redacted, and the total context sent for summarization is strictly bounded.'],
  ['Automatic takeaways', 'When the user returns near the beginning within the allowed time window, a pinned summary appears. It shows three concise takeaways, the maximum depth reached, and whether the result came from Gemini or from the on-device local fallback.'],
  ['Reliable fallback', 'If the backend is stopped, the network is slow, or Gemini cannot answer, the feature still produces a local extractive summary from the visited content. The source badge makes this fallback explicit instead of presenting local text as an AI response.'],
  ['Reader control', 'The summary never takes over the page. The reader can dismiss it, continue where they are, or choose Read from start to return smoothly to the beginning of the page or nested scrollable panel. Repeated prompts are limited per session.'],
  ['Accessibility and privacy', 'The panel uses an accessible dialog label, live status updates, keyboard-focusable actions, high contrast, and reduced-motion support. Content is collected only for this assistance flow and analytics contain aggregate measurements rather than the article text itself.']
] as const;

export default function Home() {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  // Mock save function for DB
  const savePreferences = async () => {
    if (!email) return;
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, settings: { optimizeText: true } })
      });
      setSaved(true);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 selection:bg-blue-100 selection:text-blue-900">



      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden pt-20">

        {/* Ambient Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center gap-8">

          {/* Brand/Logo Placeholder */}
          <div className="flex items-center gap-2 mb-4 opacity-80 animate-fade-in">
            <div className="w-6 h-6 rounded-full border border-white/30 flex items-center justify-center">
              <div className="w-1 h-3 bg-white/80 rounded-full" />
            </div>
            <span className="text-sm font-medium tracking-widest uppercase text-white/60">AdaptiveWeb</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-white leading-[0.9] drop-shadow-2xl">
            <span className="block bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">Build boldly.</span>
            <span className="block text-white/40">Break assumptions.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-white/50 font-light tracking-wide max-w-lg">
            Design interactions no one has seen before.
            <br />
            <span className="text-sm text-white/30 mt-2 block">Powered by Adaptive Intelligence.</span>
          </p>

          {/* CTA Section */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <span className="text-[10px] font-mono text-blue-400 tracking-widest uppercase">Timer Started</span>


          </div>

        </div>

        {/* Decorative Grid/Lines */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Eye, title: "Hover Dwell", desc: "Highlights content when you focus on it." },
              { icon: Scroll, title: "Scroll Back", desc: "Auto-summaries when you review content." },
              { icon: Zap, title: "Rapid Skim", desc: "Condenses text when you scroll fast." },
              { icon: MousePointer2, title: "Cursor Help", desc: "Detects hesitation and offers assistance." }
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:shadow-xl transition-all duration-300 group">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  <f.icon size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="demo" className="py-24 px-4 bg-slate-100 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Live Verification Lab</h2>
            <p className="text-slate-600">Ensure the extension is loaded to see these effects.</p>
          </div>

          <div className="space-y-16">

            {/* Demo 1: Hover Dwell */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-yellow-100 text-yellow-700 rounded-lg">
                  <Eye size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">1. Hover Dwell Test</h3>
                  <p className="text-slate-500">Hover your mouse over the text below for 2 seconds.</p>
                </div>
              </div>
              <div className="prose dark:prose-invert max-w-none">
                <p
                  className="text-lg leading-relaxed p-6 border-2 border-dashed border-slate-300 rounded-xl transition-all duration-300
                    hover:bg-black/90 hover:text-white hover:border-white
                    dark:hover:bg-white/90 dark:hover:text-black dark:hover:border-black
                    cursor-help"
                  id="hover-target"
                >
                  Adaptive interfaces represent the next evolution of web design. Unlike static pages that treat every user the same, an adaptive system detects your intent in real-time. By analyzing micro-interactions—like how long you hesitate on a paragraph or how quickly you scroll—the interface restructures itself to match your cognitive state. This ensures you get detailed explanations when you’re confused and concise summaries when you’re rushing.
                </p>
              </div>
            </div>

            {/* Demo 2 & 3: Scroll & Skim */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-green-100 text-green-700 rounded-lg">
                  <Scroll size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">2. Scroll Dynamics Test</h3>
                  <p className="text-slate-500">Test “Scroll Back Summary” and “Rapid Skim” here.</p>
                </div>
              </div>

              <div className="h-96 overflow-y-auto border border-slate-200 rounded-xl p-6 bg-slate-50 dark:bg-slate-900" id="scroll-container">
                <p className="mb-4 font-medium text-slate-500">--- Start Scrolling Down ---</p>
                {scrollDemoSections.map(([title, description], i) => (
                  <div key={title} className="mb-8">
                    <h4 className="text-xl font-bold mb-2">Section {i + 1}: {title}</h4>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {description} This section is intentionally detailed enough to make a fast skim measurable while keeping the demonstration readable and meaningful.
                    </p>
                    <p className="mt-2 text-slate-600 dark:text-slate-300 leading-relaxed">
                      Verification note: move quickly through this section, reach the lower end of the panel, and then return near the beginning without waiting too long. Normal slow reading should not open the automatic summary.
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                TL;DR test: scroll quickly through at least three movements, stop for about one second, and choose Compact view—no scroll-back is required. <br />
                Summary test: continue past 85%, then return above 20% within 18 seconds. The summary remains a separate feature.
              </p>
            </div>

            {/* Demo 4: Cursor */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-purple-100 text-purple-700 rounded-lg">
                  <MousePointer2 size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">3. Cursor Hesitation Test</h3>
                  <p className="text-slate-500">Move your mouse in circles or zig-zags within this area.</p>
                </div>
              </div>
              <div className="h-64 bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-purple-200 rounded-xl flex items-center justify-center relative overflow-hidden group hover:border-purple-400 transition-colors">
                <p className="text-slate-400 text-center font-medium pointer-events-none">
                  (Simulate confusion here via mouse movement)
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Backend Integration Demo */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">Sync Your Preferences</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Save your behavior profiles to our secure cloud (MongoDB).
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="px-6 py-3 rounded-xl text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={savePreferences}
              className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors"
            >
              {saved ? 'Saved!' : 'Save Config'}
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center text-slate-500 text-sm">
        <p>&copy; 2026 AdaptiveWeb. Internal Release.</p>
      </footer>
    </div>
  );
}
