# Installation Guide

## Prerequisites

- Node.js 18 or newer
- Python 3.10 or newer
- Google Chrome or another Chromium browser
- MongoDB for accounts, preferences, pairing, and persistent analytics
- A Gemini API key for optional AI assistance

## 1. Start the Next.js control plane

The Next.js application owns accounts, preferences, the dashboard, and extension pairing.

1. Open the `frontend` directory.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `MONGODB_URI`.
4. Run `npm run dev`.
5. Confirm `http://localhost:3000` opens successfully.

## 2. Start the FastAPI assistance backend

FastAPI owns Gemini assistance, grounded shortcut generation, related-content fallback, and behavior analytics.

1. Open the `backend` directory.
2. Install dependencies with `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and configure `GEMINI_API_KEY`, `MONGODB_URI`, and optional runtime settings.
4. Run `python main.py`, or run `uvicorn main:app --host 127.0.0.1 --port 8000 --reload`.
5. Confirm `http://localhost:8000/health` returns `{"status":"ok"}`.

`HOST`, `PORT`, `RELOAD`, and comma-separated `CORS_ORIGINS` are configurable in `backend/.env`. The extension's FastAPI URL must be updated separately when a non-default port or deployed server is used.

## 3. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Select the AdaptiveWeb repository root, which contains `manifest.json`.
5. Open the extension's **Details -> Extension options**.

The Options page has two independent server settings:

- **Account and preference server** defaults to `http://localhost:3000`.
- **AI and analytics backend** defaults to `http://localhost:8000`.

Remote servers must use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, and `[::1]` development addresses.

## 4. Pair preference synchronization

1. Sign in to the Next.js application.
2. Open `/settings` and generate a one-time pairing code.
3. Enter the code and account-server URL in Extension Options.
4. Select **Connect extension**.
5. Under AI and analytics backend, select **Test and save** to verify `/health` and save the FastAPI URL.

## Verification

- Use **Sync now** to verify account preferences reach the extension.
- Change FastAPI to a non-default port, update the backend field, and verify **Test and save** succeeds.
- Open the Live Verification Lab at `http://localhost:3000/#demo`.
- Stop FastAPI and confirm reading, scroll, cursor, and shortcut features use their local fallbacks.
