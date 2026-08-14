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

function loadBackground(fetchImplementation) {
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
    const context = { chrome, fetch: fetchImplementation, URL, console, setTimeout, clearTimeout };
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
    const response = await runtime.send({ type: 'AW_DISCONNECT' });
    assert.equal(response.ok, true);
    assert.equal(response.connected, false);
    assert.equal(runtime.values.awExtensionToken, undefined);
    assert.equal(runtime.values.awPreferencesCache, undefined);
});
