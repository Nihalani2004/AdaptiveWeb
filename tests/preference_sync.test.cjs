const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPreferenceRuntime() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const configStart = source.indexOf('const CONFIG');
    const classStart = source.indexOf('class BehaviorDetector');
    const nextClass = source.indexOf('class ApiService', classStart);
    const attributes = new Map();
    const context = {
        console,
        URL,
        performance: { now: () => 0 },
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: { location: { hostname: 'example.com' } },
        document: {
            hidden: false,
            documentElement: { setAttribute: (key, value) => attributes.set(key, value) },
            querySelector: () => null,
            querySelectorAll: () => [],
        },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    };
    vm.createContext(context);
    const isolated = source.slice(configStart, classStart) + source.slice(classStart, nextClass) +
        '\n;globalThis.__BehaviorDetector=BehaviorDetector;globalThis.__normalize=normalizeRuntimePreferences;globalThis.__defaults=AW_DEFAULT_PREFERENCES;globalThis.__config=CONFIG;';
    new vm.Script(isolated, { filename: 'preference-runtime-test.js' }).runInContext(context);
    return { ...context, attributes };
}

const runtime = loadPreferenceRuntime();

function validPreferences() {
    return JSON.parse(JSON.stringify(runtime.__defaults));
}

test('runtime validator accepts the canonical contract and rejects malformed timing values', () => {
    assert.ok(runtime.__normalize(validPreferences()));
    const invalid = validPreferences();
    invalid.features.hoverAssistance.delayMs = 20;
    assert.equal(runtime.__normalize(invalid), null);
    invalid.features.hoverAssistance.delayMs = 1500;
    invalid.features.cursorAssistance.enabled = 'yes';
    assert.equal(runtime.__normalize(invalid), null);
});

test('preference application updates timing and motion without reinitializing detectors', () => {
    const detector = Object.create(runtime.__BehaviorDetector.prototype);
    detector.ui = { dismissTldrPrompt: () => {} };
    detector.tldrSessions = new Map();
    const preferences = validPreferences();
    preferences.features.scrollBackSummary.returnWindowMs = 27000;
    preferences.accessibility.reducedMotion = 'reduce';
    assert.equal(detector.setPreferences(preferences), true);
    assert.equal(runtime.__config.scrollReturnWindow, 27000);
    assert.equal(runtime.attributes.get('data-aw-motion'), 'reduce');
    assert.equal(detector.featureEnabled('scrollBackSummary'), true);
});

test('disabled features suppress summaries and compact-reading prompts', () => {
    const detector = Object.create(runtime.__BehaviorDetector.prototype);
    const preferences = validPreferences();
    preferences.features.scrollBackSummary.enabled = false;
    preferences.features.compactReading.mode = 'off';
    detector.preferences = preferences;
    detector.scrollSummaryInFlight = false;
    detector.getScrollSummaryCount = () => 0;
    let scheduled = 0;
    detector.ui = { showScrollToast: () => {} };
    detector.api = { log: () => {} };
    detector.scheduleTldrAssistance = () => { scheduled += 1; };
    assert.equal(detector.shouldSuppressScrollSummary(runtime.window), true);
    detector.onRapidSkimDetected(runtime.window, { maxDepth: 0.9, fastEventTotal: 4 });
    assert.equal(scheduled, 0);
});

test('optional hover and exit summaries honor Gemini preference and retain a labeled local fallback', async () => {
    const detector = Object.create(runtime.__BehaviorDetector.prototype);
    const preferences = validPreferences();
    preferences.ai.allowGemini = false;
    detector.preferences = preferences;
    let remoteCalls = 0;
    detector.api = { summarize: async () => { remoteCalls += 1; return null; } };
    const local = await detector.summarizeTextWithFallback(
        'AdaptiveWeb keeps this complete source sentence. A second sentence remains available for local extraction.'
    );
    assert.equal(local.method, 'Local summary');
    assert.match(local.summary, /AdaptiveWeb keeps this complete source sentence/);
    assert.equal(remoteCalls, 0);

    preferences.ai.allowGemini = true;
    const unavailable = await detector.summarizeTextWithFallback(
        'AdaptiveWeb keeps this complete source sentence. A second sentence remains available for local extraction.'
    );
    assert.equal(unavailable.method, 'Local summary');
    assert.equal(remoteCalls, 1);
});

test('engaged-reader assistance falls back to grounded page links when FastAPI is unavailable', async () => {
    const detector = Object.create(runtime.__BehaviorDetector.prototype);
    const fallbackArticle = { title: 'A related page found locally', url: 'https://example.com/related', image: '' };
    const scans = [];
    let shown = null;
    detector.api = {
        log: () => {},
        getRelated: async () => null,
    };
    detector.ui = { showSidebar: articles => { shown = articles; } };
    detector.scrapeRelatedLinks = includeGeneralLinks => {
        scans.push(Boolean(includeGeneralLinks));
        return includeGeneralLinks ? [fallbackArticle] : [];
    };

    await detector.onEngagedReader();

    assert.deepEqual(scans, [false, true]);
    assert.deepEqual(shown, [fallbackArticle]);
});

test('related-reading sidebar renders backend content through safe DOM text nodes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const start = source.indexOf('showSidebar(articles)');
    const end = source.indexOf('// 3. Takeaways', start);
    const implementation = source.slice(start, end);
    assert.match(implementation, /title\.textContent/);
    assert.match(implementation, /new URL\(/);
    assert.doesNotMatch(implementation, /innerHTML/);
});

test('manifest declares isolated storage, background sync, and an options page', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    assert.ok(manifest.permissions.includes('storage'));
    assert.ok(manifest.permissions.includes('alarms'));
    assert.equal(manifest.background.service_worker, 'background.js');
    assert.equal(manifest.options_ui.page, 'options.html');
});

test('page bridge never sends an extension credential into the page context', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'content_script.js'), 'utf8');
    const preferenceMessage = bridge.match(/window\.postMessage\(\{ type: 'AW_PREFERENCES_UPDATE'[^;]+/g) || [];
    assert.ok(preferenceMessage.length >= 1);
    preferenceMessage.forEach((message) => assert.doesNotMatch(message, /token|credential|authorization/i));
});

function loadBackground(fetchImplementation, timers = {}) {
    const values = {};
    let messageListener;
    const chrome = {
        storage: { local: {
            async get(keys) { return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]])); },
            async set(update) { Object.assign(values, update); },
            async remove(keys) { for (const key of keys) delete values[key]; },
        } },
        runtime: {
            onInstalled: { addListener() {} },
            onStartup: { addListener() {} },
            onMessage: { addListener(listener) { messageListener = listener; } },
        },
        alarms: { create() {}, onAlarm: { addListener() {} } },
    };
    const context = {
        chrome,
        fetch: fetchImplementation,
        URL,
        AbortController,
        console,
        setTimeout: timers.setTimeout || setTimeout,
        clearTimeout: timers.clearTimeout || clearTimeout,
    };
    vm.createContext(context);
    new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), { filename: 'background-test.js' }).runInContext(context);
    async function send(message) {
        return new Promise((resolve) => messageListener(message, {}, resolve));
    }
    return { values, send };
}

test('background pairing stores the credential only in extension-local storage', async () => {
    const preferences = validPreferences();
    const runtime = loadBackground(async (url, options) => {
        assert.match(url, /\/api\/extension\/pair\/exchange$/);
        assert.equal(JSON.parse(options.body).code, 'A1B2C3D4E5');
        return { ok: true, async json() { return { token: 'x'.repeat(43), preferences, account: { name: 'Test', email: 'test@example.test' } }; } };
    });
    const response = await runtime.send({ type: 'AW_PAIR', code: 'A1B2C3D4E5', controlPlane: 'http://localhost:3000' });
    assert.equal(response.ok, true);
    assert.equal(runtime.values.awExtensionToken, 'x'.repeat(43));
    assert.deepEqual(runtime.values.awPreferencesCache, preferences);
});

test('failed sync retains last-known-good preferences and reports a recoverable error', async () => {
    const runtime = loadBackground(async () => { throw new Error('server offline'); });
    runtime.values.awExtensionToken = 'x'.repeat(43);
    runtime.values.awPreferencesCache = validPreferences();
    const response = await runtime.send({ type: 'AW_SYNC_NOW' });
    assert.equal(response.ok, true);
    assert.equal(response.cached, true);
    assert.equal(response.error, 'server offline');
    assert.ok(runtime.values.awPreferencesCache);
    assert.equal(runtime.values.awSyncError, 'server offline');
});

test('local disconnect clears credentials even when revocation is unreachable', async () => {
    const runtime = loadBackground(async () => { throw new Error('server offline'); });
    runtime.values.awExtensionToken = 'x'.repeat(43);
    runtime.values.awPreferencesCache = validPreferences();
    runtime.values.awBackendBaseUrl = 'https://api.example.test';
    const response = await runtime.send({ type: 'AW_DISCONNECT' });
    assert.equal(response.ok, true);
    assert.equal(response.connected, false);
    assert.equal(runtime.values.awExtensionToken, undefined);
    assert.equal(runtime.values.awPreferencesCache, undefined);
    assert.equal(runtime.values.awBackendBaseUrl, 'https://api.example.test');
});

test('FastAPI configuration defaults to localhost without changing the account server', async () => {
    const runtime = loadBackground(async () => { throw new Error('unexpected request'); });
    const backend = await runtime.send({ type: 'AW_GET_BACKEND_CONFIG' });
    const account = await runtime.send({ type: 'AW_GET_SYNC_STATE' });
    assert.equal(backend.ok, true);
    assert.equal(backend.backendBaseUrl, 'http://localhost:8000');
    assert.equal(account.awControlPlane, 'http://localhost:3000');
});

test('FastAPI URL validation accepts loopback and HTTPS URLs and normalizes trailing slashes', async () => {
    const runtime = loadBackground(async () => { throw new Error('unexpected request'); });
    let response = await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'http://localhost:8000/' });
    assert.equal(response.ok, true);
    assert.equal(response.backendBaseUrl, 'http://localhost:8000');

    response = await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'http://127.0.0.1:8100/' });
    assert.equal(response.ok, true);
    assert.equal(response.backendBaseUrl, 'http://127.0.0.1:8100');
    assert.equal(runtime.values.awBackendBaseUrl, 'http://127.0.0.1:8100');

    response = await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'http://[::1]:8200/' });
    assert.equal(response.ok, true);
    assert.equal(response.backendBaseUrl, 'http://[::1]:8200');

    response = await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'https://api.example.test/adaptiveweb/' });
    assert.equal(response.ok, true);
    assert.equal(response.backendBaseUrl, 'https://api.example.test/adaptiveweb');
});

test('FastAPI URL validation rejects insecure remote, credential, query, fragment, and non-web URLs', async () => {
    const runtime = loadBackground(async () => { throw new Error('unexpected request'); });
    runtime.values.awBackendBaseUrl = 'https://working.example.test';
    for (const backendBaseUrl of [
        'http://api.example.test',
        'https://user:password@api.example.test',
        'https://api.example.test?target=other',
        'https://api.example.test/#fragment',
        'https://api.example.test/api',
        'file:///tmp/backend',
        'data:application/json,%7B%7D',
        'javascript:alert(1)',
        `https://api.example.test/${'a'.repeat(2050)}`,
    ]) {
        const response = await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl });
        assert.equal(response.ok, false, backendBaseUrl);
        assert.equal(runtime.values.awBackendBaseUrl, 'https://working.example.test');
    }
});

test('background FastAPI proxy uses only the saved URL and enforces the endpoint allowlist', async () => {
    let requestedUrl = '';
    const runtime = loadBackground(async (url, options) => {
        requestedUrl = url;
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { text: 'Explain this' });
        return { ok: true, async json() { return { summary: 'Configured backend response', method: 'gemini_test' }; } };
    });
    runtime.values.awBackendBaseUrl = 'https://api.example.test/base';
    const response = await runtime.send({
        type: 'AW_BACKEND_REQUEST',
        endpoint: 'summarize',
        body: { text: 'Explain this' },
        backendBaseUrl: 'https://attacker.example.test',
        url: 'https://attacker.example.test/api/summarize',
    });
    assert.equal(response.ok, true);
    assert.equal(response.summary, 'Configured backend response');
    assert.equal(requestedUrl, 'https://api.example.test/base/api/summarize');

    const rejected = await runtime.send({ type: 'AW_BACKEND_REQUEST', endpoint: '../health', body: {} });
    assert.equal(rejected.ok, false);
});

test('changing the saved FastAPI URL affects subsequent requests without reloading the extension', async () => {
    const requestedUrls = [];
    const runtime = loadBackground(async (url) => {
        requestedUrls.push(url);
        return { ok: true, async json() { return {}; } };
    });

    await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'http://127.0.0.1:8100' });
    await runtime.send({ type: 'AW_BACKEND_REQUEST', endpoint: 'analytics', body: { eventType: 'first' } });
    await runtime.send({ type: 'AW_SET_BACKEND_CONFIG', backendBaseUrl: 'https://api.example.test/base' });
    await runtime.send({ type: 'AW_BACKEND_REQUEST', endpoint: 'related', body: { url: 'https://example.test' } });

    assert.deepEqual(requestedUrls, [
        'http://127.0.0.1:8100/api/analytics',
        'https://api.example.test/base/api/related',
    ]);
});

test('every allowlisted FastAPI operation is routed through the configured backend base URL', async () => {
    const requestedUrls = [];
    const runtime = loadBackground(async (url) => {
        requestedUrls.push(url);
        return { ok: true, async json() { return {}; } };
    });
    runtime.values.awBackendBaseUrl = 'http://127.0.0.1:8100';
    const endpoints = ['suggest', 'analytics', 'simplify', 'summarize', 'related', 'shortcuts'];

    for (const endpoint of endpoints) {
        const response = await runtime.send({ type: 'AW_BACKEND_REQUEST', endpoint, body: {} });
        assert.equal(response.ok, true, endpoint);
    }

    assert.deepEqual(requestedUrls, endpoints.map(endpoint => `http://127.0.0.1:8100/api/${endpoint}`));
});

test('successful health check saves the candidate FastAPI URL and records its timestamp', async () => {
    const runtime = loadBackground(async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:8100/health');
        assert.equal(options.method, 'GET');
        return { ok: true, async json() { return { status: 'ok' }; } };
    });
    const response = await runtime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'http://127.0.0.1:8100/',
        saveOnSuccess: true,
    });
    assert.equal(response.ok, true);
    assert.equal(response.saved, true);
    assert.equal(runtime.values.awBackendBaseUrl, 'http://127.0.0.1:8100');
    assert.ok(runtime.values.awBackendLastCheck);
    assert.equal(runtime.values.awBackendError, '');
});

test('failed health check preserves the last working FastAPI URL', async () => {
    const runtime = loadBackground(async () => { throw new Error('connection refused'); });
    runtime.values.awBackendBaseUrl = 'https://working.example.test';
    const response = await runtime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'https://offline.example.test',
        saveOnSuccess: true,
    });
    assert.equal(response.ok, false);
    assert.equal(runtime.values.awBackendBaseUrl, 'https://working.example.test');
    assert.equal(runtime.values.awBackendError, 'connection refused');
});

test('FastAPI health test reports timeouts and preserves the saved URL', async () => {
    const runtime = loadBackground((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
    }), {
        setTimeout(callback) { queueMicrotask(callback); return 1; },
        clearTimeout() {},
    });
    runtime.values.awBackendBaseUrl = 'https://working.example.test';

    const response = await runtime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'https://slow.example.test',
        saveOnSuccess: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.error, 'Backend request timed out.');
    assert.equal(runtime.values.awBackendBaseUrl, 'https://working.example.test');
});

test('FastAPI health test rejects invalid JSON without replacing the saved URL', async () => {
    const runtime = loadBackground(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async text() { return 'not-json'; },
    }));
    runtime.values.awBackendBaseUrl = 'https://working.example.test';

    const response = await runtime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'https://invalid-json.example.test',
        saveOnSuccess: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.error, 'Backend returned an invalid JSON response.');
    assert.equal(runtime.values.awBackendBaseUrl, 'https://working.example.test');
});

test('FastAPI health test reports HTTP errors and requires status ok', async () => {
    const httpErrorRuntime = loadBackground(async () => ({
        ok: false,
        status: 503,
        headers: { get: () => null },
        async text() { return JSON.stringify({ detail: 'Backend maintenance' }); },
    }));
    let response = await httpErrorRuntime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'https://maintenance.example.test',
        saveOnSuccess: true,
    });
    assert.equal(response.ok, false);
    assert.equal(response.error, 'Backend maintenance');

    const invalidHealthRuntime = loadBackground(async () => ({
        ok: true,
        async json() { return { status: 'starting' }; },
    }));
    response = await invalidHealthRuntime.send({
        type: 'AW_TEST_BACKEND',
        backendBaseUrl: 'https://starting.example.test',
        saveOnSuccess: true,
    });
    assert.equal(response.ok, false);
    assert.match(response.error, /status ok/);
});

test('FastAPI proxy rejects oversized JSON responses cleanly', async () => {
    const runtime = loadBackground(async () => ({
        ok: true,
        status: 200,
        headers: { get: name => name === 'content-length' ? String(2 * 1024 * 1024) : null },
        async text() { return '{}'; },
    }));

    const response = await runtime.send({ type: 'AW_BACKEND_REQUEST', endpoint: 'related', body: {} });

    assert.equal(response.ok, false);
    assert.equal(response.error, 'Backend response is too large.');
});

test('restoring FastAPI configuration removes the override and returns the local default', async () => {
    const runtime = loadBackground(async () => { throw new Error('unexpected request'); });
    runtime.values.awBackendBaseUrl = 'https://api.example.test';
    runtime.values.awBackendLastCheck = '2026-01-01T00:00:00.000Z';
    runtime.values.awBackendError = 'old error';
    const response = await runtime.send({ type: 'AW_RESET_BACKEND_CONFIG' });
    assert.equal(response.ok, true);
    assert.equal(response.backendBaseUrl, 'http://localhost:8000');
    assert.equal(runtime.values.awBackendBaseUrl, undefined);
    assert.equal(runtime.values.awBackendLastCheck, undefined);
    assert.equal(runtime.values.awBackendError, undefined);
});

test('content bridge delegates FastAPI requests without containing a hardcoded backend destination', () => {
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'content_script.js'), 'utf8');
    assert.match(bridge, /type: 'AW_BACKEND_REQUEST'/);
    assert.doesNotMatch(bridge, /localhost:8000/);
    assert.doesNotMatch(bridge, /event\.data\.(?:url|backendBaseUrl)/);
    assert.doesNotMatch(bridge, /fetch\s*\(/);
});

test('extension options keep account and FastAPI configuration separate', () => {
    const markup = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
    assert.match(markup, /id="control-plane"/);
    assert.match(markup, /id="backend-server"/);
    assert.match(markup, /id="save-backend"/);
    assert.match(markup, /id="test-backend"/);
    assert.match(markup, /id="reset-backend"/);
    assert.match(script, /AW_SET_BACKEND_CONFIG/);
    assert.match(script, /AW_TEST_BACKEND/);
    assert.match(script, /AW_RESET_BACKEND_CONFIG/);
});
