const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBehaviorDetector() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const configStart = source.indexOf('const CONFIG');
    const classStart = source.indexOf('class BehaviorDetector');
    const nextClass = source.indexOf('class ApiService', classStart);
    assert.ok(configStart >= 0 && classStart >= 0 && nextClass > classStart);

    const context = {
        console,
        URL,
        performance: { now: () => 5000 },
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            location: { href: 'https://example.com/form', hostname: 'example.com' },
            getComputedStyle: () => ({ pointerEvents: 'auto' })
        },
        document: {
            title: 'Checkout help',
            hidden: false,
            body: {},
            documentElement: {},
            activeElement: null,
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            elementFromPoint: () => null
        },
        localStorage: { getItem: () => null, setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {} }
    };
    vm.createContext(context);
    const isolatedSource =
        source.slice(configStart, classStart) +
        source.slice(classStart, nextClass) +
        '\n;globalThis.__BehaviorDetector = BehaviorDetector;';
    new vm.Script(isolatedSource, { filename: 'cursor-detector-test.js' }).runInContext(context);
    return { BehaviorDetector: context.__BehaviorDetector, context };
}

function makeTarget({
    tagName = 'BUTTON',
    label = 'Continue',
    type = 'button',
    form = null,
    disabled = false,
    role = '',
    href = 'https://example.com/next'
} = {}) {
    const attributes = new Map();
    if (role) attributes.set('role', role);
    if (tagName === 'A') attributes.set('href', href);
    if (tagName === 'BUTTON') attributes.set('type', type);
    return {
        tagName,
        type,
        href,
        innerText: label,
        disabled,
        isConnected: true,
        parentElement: null,
        labels: [],
        clickCount: 0,
        focusCount: 0,
        click() { this.clickCount += 1; },
        focus() { this.focusCount += 1; },
        closest(selector) { return selector === 'form' ? form : null; },
        contains: () => false,
        getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
        hasAttribute(name) { return attributes.has(name); },
        getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 30 })
    };
}

const { BehaviorDetector, context } = loadBehaviorDetector();

test('expired cursor samples are pruned without reading an undefined target', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    detector.cursorTracker = {
        samples: [{ x: 10, y: 10, time: 0, target: null }],
        transitions: [],
        retreats: [],
        deadClicks: [],
        formEvents: [],
        state: 'observing',
        lastInputAt: 0,
        cooldownUntil: 0,
        lastTarget: null
    };
    detector.shouldSuppressCursorHelp = () => false;
    assert.doesNotThrow(() => detector.analyzeCursorHesitation());
    assert.equal(detector.cursorTracker.samples.length, 0);
    assert.equal(detector.cursorTracker.state, 'observing');
});

test('safe activation policy permits ordinary controls and blocks sensitive or submitting controls', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    assert.equal(detector.getSafeActivationPolicy(makeTarget()).allowed, true);
    assert.equal(detector.getSafeActivationPolicy(makeTarget({ label: 'Delete account' })).allowed, false);
    assert.equal(
        detector.getSafeActivationPolicy(makeTarget({ type: 'submit', form: { querySelector: () => null } })).allowed,
        false
    );
});

test('AI context is structured, grounded, and redacts common sensitive text', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    detector.getNearbyActionDescriptors = () => [{
        targetId: 'target-7',
        label: 'Read details',
        type: 'link',
        stateSummary: 'Available',
        capabilities: ['highlight', 'focus', 'activate']
    }];
    detector.getMissingFormFields = () => ['Email'];
    const container = { innerText: 'Contact jane@example.com or +1 555 123 4567 for help.' };
    const target = { closest: () => container, parentElement: container };
    const result = JSON.parse(detector.buildCursorHelpContext({
        target,
        pattern: 'stationary_near_action',
        confidence: 0.82,
        targetType: 'link',
        targetLabel: 'Read details'
    }));
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.availableActions[0].targetId, 'target-7');
    assert.equal(result.nearbyContext.includes('jane@example.com'), false);
    assert.match(result.nearbyContext, /\[email removed\]/);
});

test('form assistance reports missing fields and creates focus actions', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    detector.cursorTargetIds = new WeakMap();
    detector.cursorTargetsById = new Map();
    detector.cursorTargetIdCounter = 0;
    const field = {
        tagName: 'INPUT',
        type: 'email',
        name: 'email',
        value: '',
        required: true,
        disabled: false,
        isConnected: true,
        labels: [{ innerText: 'Email address' }],
        validity: { valid: false },
        validationMessage: 'Please fill out this field.',
        getAttribute: () => null
    };
    const form = { querySelectorAll: () => [field], querySelector: () => null };
    const target = makeTarget({ tagName: 'INPUT', label: 'Email address' });
    target.closest = () => form;
    const result = detector.buildFormAssistance({ target, targetLabel: 'Email address' });
    assert.match(result.summary, /1 field needs attention/);
    assert.equal(result.actions[0].actionType, 'focus');
    assert.match(result.actions[0].description, /required field is empty/i);
});

test('activate suggestions wait for confirmation before clicking', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const target = makeTarget();
    let confirmAction = null;
    detector.cursorTargetsById = new Map([['target-1', target]]);
    detector.ui = {
        highlightAssistedTarget: () => {},
        setAssistanceStatus: () => {},
        showActionConfirmation: (_action, callback) => { confirmAction = callback; }
    };
    detector.api = { log: () => {} };
    const analysis = { target, pattern: 'stationary_near_action' };
    detector.handleSuggestedAction({
        label: 'Continue',
        actionType: 'activate',
        targetId: 'target-1'
    }, analysis, 'ai');
    assert.equal(target.clickCount, 0);
    assert.equal(typeof confirmAction, 'function');
    confirmAction();
    assert.equal(target.clickCount, 1);
});

test('sensitive activate suggestions are never confirmed or clicked', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const target = makeTarget({ label: 'Purchase now' });
    let confirmationShown = false;
    let status = '';
    detector.cursorTargetsById = new Map([['target-2', target]]);
    detector.ui = {
        highlightAssistedTarget: () => {},
        setAssistanceStatus: (message) => { status = message; },
        showActionConfirmation: () => { confirmationShown = true; }
    };
    detector.api = { log: () => {} };
    detector.handleSuggestedAction({
        label: 'Purchase now',
        actionType: 'activate',
        targetId: 'target-2'
    }, { target, pattern: 'stationary_near_action' }, 'ai');
    assert.equal(confirmationShown, false);
    assert.equal(target.clickCount, 0);
    assert.match(status, /never activated/i);
});

