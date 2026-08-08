# Installation Guide

## Prerequisites
- Node.js 18+
- Google Chrome (or Chromium browser)
- MongoDB (optional, for backend features)

## Setup Steps

### 1. Web Application
The web application serves as the home for AdaptiveWeb and the verification lab.
1. Navigate to `web-app` directory.
2. Install dependencies: `npm install`.
3. Create `.env.local` with `MONGODB_URI` if you want database features (optional for UI demo).
4. Run server: `npm run dev`.

### 2. Chrome Extension
1. Open `chrome://extensions` in your browser.
2. Toggle "Developer mode" on.
3. Click "Load unpacked".
4. Browse to the `AdaptiveWeb/extension` directory and select it.
5. The extension is now active on all pages.

## Verification
- Open the Web App at `http://localhost:3000`.
- Scroll down to the "Live Verification Lab".
- Follow instructions to test Hover, Scroll, and Cursor behaviors.
