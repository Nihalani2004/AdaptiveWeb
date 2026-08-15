# Account-owned preference sync

AdaptiveWeb's dashboard and extension share one versioned preference contract. The Next.js application owns identity, preferences, and extension credentials; FastAPI remains responsible for AI assistance and behavior analytics.

## Preference contract

Schema version `1` includes:

- Hover assistance and its 500–10,000 ms delay.
- Reading-difficulty assistance.
- Scroll-back summaries and their 5–60 second return window.
- Compact reading in Ask, Automatic, or Off mode.
- Cursor assistance, grounded keyboard shortcuts, and exit assistance.
- Permission to use Gemini. When disabled, supported assistance uses its labeled local fallback.
- System, reduced, or full motion.

The server rejects unknown, incomplete, incorrectly typed, or out-of-range contracts. Updates are full replacements with a revision number; a stale revision receives HTTP `409` instead of overwriting a newer change.

## Identity and ownership

- Registration stores an `scrypt` password hash with a random per-user salt.
- Login creates a random opaque session. Only its SHA-256 hash is stored in MongoDB.
- The browser receives an `HttpOnly`, `SameSite=Lax` session cookie; API responses never expose password data.
- Preference reads and writes derive `userId` from the session, never from request-supplied email.
- Authentication and pairing endpoints are rate limited, and cookie-authenticated mutations require a same-origin request.

The old email-only `POST /api/config` endpoint returns HTTP `410` and cannot mutate data.

## Legacy migration

After a user authenticates, the preference store searches for an unowned legacy record with that verified email. If found, it assigns the authenticated `userId` and maps `optimizeText`, `hoverDelay`, and `scrollBackWindow` into the versioned contract. Records are never claimable merely by submitting an email to an API. Missing or invalid legacy values receive safe defaults.

## Extension pairing

1. Sign in to the website and open `/settings`.
2. Select **Generate code**. The server stores only the hash of the 10-character code; it expires after 10 minutes.
3. Open the unpacked extension's **Details → Extension options**.
4. Keep `http://localhost:3000` for local development, enter the code, and select **Connect extension**.
5. The code is atomically consumed. The server returns one random 90-day bearer token and stores only its hash.

The token lives only in `chrome.storage.local` and the background service worker. Content scripts receive validated preferences, never credentials. Production control-plane URLs must use HTTPS; HTTP is accepted only for localhost/127.0.0.1.

The extension syncs on startup, every 15 minutes, and when **Sync now** is selected. If the server is unavailable, the last-known-good contract remains active and the options page reports the sync error. Disconnect revokes the server credential when reachable and always clears the local token.

## FastAPI backend configuration

The Next.js control plane and FastAPI assistance backend use independent URLs. Extension Options stores the FastAPI base URL as `awBackendBaseUrl` in `chrome.storage.local`; the default is `http://localhost:8000`. The base URL does not include `/api`.

FastAPI requests are executed by the background service worker. Injected page code can request only the bounded `suggest`, `analytics`, `simplify`, `summarize`, `related`, and `shortcuts` operations; it cannot supply or override the destination URL. Production backend URLs must use HTTPS. HTTP is accepted only for localhost loopback addresses, and URLs containing credentials, query parameters, or fragments are rejected.

**Save URL** validates and stores a backend even when it is temporarily offline. **Test and save** first requires a successful JSON response from `/health` with `status: "ok"`, preserving the previous saved URL if the check fails. **Restore local default** returns to `http://localhost:8000`. Changing the saved URL affects the next assistance request without reloading open pages.

## Runtime behavior

All detectors initialize once. Preference updates change guards and timing values without registering duplicate listeners. Disabling a feature prevents new assistance and dismisses relevant visible UI. Turning Gemini off routes reading help, cursor help, and scroll summaries to their clearly labeled local behavior and prevents shortcut-generation requests. Reduced motion is applied through `data-aw-motion` without altering host-page classes.

Related-reading assistance prefers links already published in related or article sections. If FastAPI is unavailable, it performs a broader local scan of valid page links instead of leaving the assistance path dependent on the server. Backend- and page-provided titles are rendered as text, and only HTTP(S) destinations are accepted.

## Rollout and recovery

- `FEATURE_PREFERENCE_SYNC=true` enables pairing and extension preference reads (default).
- Set it to `false` to return HTTP `503` from new pairing and sync reads while leaving website preference editing and cached extension settings intact.
- `/api/extension/status` shows active credentials, last use, and expiry. Users can revoke every connection from Settings.
- Pairing and sync responses use `Cache-Control: no-store`; raw codes and tokens must never be logged.
- If the database is unavailable, UI operations display the server error and never show a false Saved/Connected state.

For a multi-instance production deployment, move the in-process rate-limit counters to a shared store and add expiration/failed-sync metrics to the monitoring platform.
