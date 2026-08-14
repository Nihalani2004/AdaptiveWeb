

# AdaptiveWeb 🌐

**Real-Time Intelligent UI Adaptation via Micro-Behavior Analysis**

> A modular browser extension + backend system that detects user micro-behaviors and adapts web interfaces in real time using rule-driven intelligence.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Architecture](https://img.shields.io/badge/System-Architecture-orange)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📌 What is AdaptiveWeb?

**AdaptiveWeb** is an intelligent UI adaptation layer that observes **user micro-behaviors** (scrolling, hovering, cursor hesitation, dwell time) and dynamically adjusts web interfaces to reduce cognitive load and improve navigation efficiency.

Unlike traditional personalization tools, AdaptiveWeb:

* Works **without user configuration**
* Operates **non-intrusively**
* Adapts interfaces **in real time**
* Uses **rule-based intent inference**, not invasive tracking

---

## 🎯 Core Capabilities

* Detects **user intent** from behavior signals
* Applies **contextual UI adaptations**
* Supports **client-only mode** and **rule-driven backend mode**
* Designed for **high performance & privacy**

---

## ✨ Key Features

### 📖 Reading-Difficulty Assistance

Offers help only after multiple on-device signals indicate that a long paragraph may need extra attention.

* Signals: Meaningful revisits, reading-time-adjusted dwell, upward regression, text selection, and pointer dwell are combined into a confidence score
* Guards: Short or highly interactive content, forms, navigation, editable regions, active media, rapid skimming, recent input, existing overlays, cooldowns, and hidden tabs are excluded
* Choice: The user can select **Simplify**, **Explain terms**, **Show example**, or **Not now**; no paragraph is changed automatically
* Result: Gemini returns a structured, fact-preserving aid when available; a clearly labeled, non-inventive local fallback preserves and reformats the complete source when it is not
* Safety: The original paragraph remains in the DOM and can be shown, hidden, or fully restored; dynamically added paragraphs are observed and removed content is cleaned up
* Accessibility: Semantic regions, live loading status, keyboard controls, Escape dismissal, focus indicators, high-contrast colors, and reduced-motion styles are included

---

### 🎨 Hover Dwell Highlight

Highlights content the user is actively reading.

* Trigger: Hover > **1500 ms**
* Effect: Soft highlight with fade-out
* Goal: Visual confirmation of focus

---

### 📋 Scroll-Back Auto Summary

Displays a contextual summary after a meaningful rapid skim and return.

* Trigger: Reach at least **85% depth**, then return above **20%** within the guarded gesture windows
* Coverage: Works on the main page and nested scrollable containers
* Effect: Accessible pinned panel with three takeaways, depth metadata, dismiss, and read-from-start controls
* Reliability: Signed direction tracking, travel thresholds, timing windows, cooldowns, and two prompts per tab session reduce false positives
* Fallback: Uses Gemini when available and a clearly labeled local extractive summary when it is not
* Privacy: Samples bounded visible content, removes duplicates, and redacts common email, phone, and long-number patterns

---

### ⚡ Rapid Skimming (TL;DR Mode)

Condenses long content during fast scrolling.

* Trigger: Three or more rapid scroll samples, followed by a short scrolling pause
* Independence: Runs separately from the scroll-back summary; returning to the top is not required
* Effect: Offers a compact reading view with locally selected key-point previews while preserving the original paragraphs
* Controls: Read individual paragraphs, expand all, return to key points, exit and restore, switch between Ask and Automatic modes, or disable it for the current tab
* Safety: Skips introductions when enough content exists, forms, navigation, tables, alerts, editable regions and paragraphs dominated by interactive controls
* Dynamic pages: Processes eligible paragraphs added later without creating duplicate controls
* Goal: Faster information scanning

---

### 🤔 Cursor Hesitation Assistance

Detects several forms of uncertainty and offers contextual, privacy-conscious guidance.

* Triggers: Pausing near an action, circular or zig-zag searching, switching between choices, repeated approach/retreat, dead clicks, and form difficulty
* Intelligence: Rolling four-second movement analysis, adaptive per-site speed baseline, confidence scoring, confirmation state, cooldowns, and false-positive guards
* Effect: Accessible suggestion bubble with local assistance or three context-aware Gemini suggestions
* Privacy: Raw cursor coordinates stay in memory and are never included in analytics; sensitive nearby text is redacted before AI requests
* Goal: Reduce friction and confusion without interrupting normal reading or typing

---

### ⌨️ Grounded Keyboard Shortcuts

Provides working keyboard access to controls that are actually present on the current page.

* Availability: Three local navigation shortcuts appear immediately, even when the backend is offline
* Grounding: Gemini can only bind keys to controls discovered by the extension; invented targets and unsupported actions are rejected
* Keys: Supports single keys, modifier chords such as `Ctrl+Enter`, and ordered sequences such as `G then H`
* Actions: Focuses or safely activates real controls, scrolls to the page start/end, and toggles the shortcut panel
* Safety: Typing is protected, stale targets are re-resolved, and submit, payment, purchase, deletion, publishing, account and other sensitive controls are never activated automatically

---

## 🧠 High-Level Architecture

```
Browser (Client)
 └─ Chrome Extension
     ├─ Behavior Detection Modules
     ├─ Intent Inference Engine
     ├─ UI Adaptation Layer
     ├─ Local Analytics Buffer
     └─ Upload Scheduler
          ↓
Backend (Optional)
 ├─ API Gateway
 ├─ Analytics Ingestion
 ├─ Pattern Analysis Jobs
 ├─ Rule Generator
 └─ MongoDB (Adaptation Rules)
          ↓
Partner Integration
 └─ AdaptiveWeb SDK / UI Adaptation Engine
```

---



## �  Architecture Diagram

> Full system flow including client, backend, jobs, and partner integration.

![Architecture Diagram](frontend/public/architecturedig.png)

---

## 🧱 Component Breakdown

| Layer   | Component               | Responsibility                        |
| ------- | ----------------------- | ------------------------------------- |
| Client  | Behavior Detection      | Capture scroll, hover, cursor signals |
| Client  | Intent Inference Engine | Rule-based intent classification      |
| Client  | UI Adaptation Layer     | DOM & CSS mutations                   |
| Client  | Local Storage           | IndexedDB + Chrome Storage            |
| Client  | Upload Scheduler        | Batched analytics uploads             |
| Backend | API Gateway             | Secure ingestion endpoint             |
| Backend | Analytics Service       | Event processing                      |
| Backend | Job Processing          | Pattern analysis & rule generation    |
| Backend | MongoDB                 | Adaptation rules & summaries          |
| Partner | SDK / UI Engine         | Rule-driven UI application            |

---

## 📁 Project Structure

```
adaptiveweb/
├── extension/
│   ├── manifest.json
│   ├── content_script.js
│   ├── injected.js
│   ├── injected.css
│   └── icons/
│
├── backend/
│   ├── api-gateway/
│   ├── analytics-service/
│   ├── jobs/
│   └── database/
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── TESTING.md
│
├── demo/
│   ├── index.html
│   └── test.js
│
└── README.md
```

---

## 🚀 Installation (Chrome Extension)

```bash
git clone https://github.com/yourusername/adaptiveweb.git
cd adaptiveweb
```

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the repository root (the folder containing `manifest.json`)

✅ AdaptiveWeb activates automatically on all pages.

---

## ⚙️ Configuration

Sign in at `/login` and use `/settings` to manage the versioned behavior profile. Pair the browser extension from its Options page with a one-time code generated in Settings. The extension keeps a last-known-good profile in `chrome.storage.local` and syncs at startup, every 15 minutes, or on demand. See [Account-owned preference sync](docs/PREFERENCE_SYNC.md) for the contract, security model, migration, rollout flag, and recovery behavior.

Low-level detector thresholds remain in `injected.js`; user-facing timing controls are validated by the shared preference contract.

---

## 📊 Performance Targets

| Metric           | Target        |
| ---------------- | ------------- |
| Script load      | < 100 ms      |
| Memory usage     | < 5 MB        |
| Scroll FPS       | 60 FPS        |
| Event throttling | Yes           |
| DOM safety       | WeakMap-based |

---

## 🔒 Privacy & Security

* ✅ Client-side first architecture
* ✅ No raw user data stored
* ✅ No third-party trackers
* ✅ Batched + anonymized analytics
* ✅ API key validation (backend)

---

## 🧪 Testing

Run the frontend demo with `npm run dev` from `frontend`, start the FastAPI backend, and reload the unpacked extension after source changes. Detailed manual checks are in `docs/TESTING.md`.

Test scenarios:

* Repeated paragraph attention → optional reading assistance
* Hover dwell → highlight
* Scroll back → summary
* Rapid scroll → TL;DR
* Cursor hesitation → suggestion

---

## 🛣️ Roadmap

### Phase 2

* ML-based intent scoring
* Personal behavior baselines
* Accessibility-focused adaptations

### Phase 3

* Rule editor dashboard
* AI summarization (optional)
* Cross-site adaptation profiles

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Commit clean, documented code
4. Open a Pull Request

---

## 📄 License

MIT License © AdaptiveWeb

---

## 📬 Contact

For feedback, ideas, or collaboration — open an issue.

---

**AdaptiveWeb — Making the web adapt to humans, not the other way around.** 🌐✨
