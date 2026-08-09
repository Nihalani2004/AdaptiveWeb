const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadShortcutsManager() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const classStart = source.indexOf('class ShortcutsManager');
    const initStart = source.indexOf('// Init', classStart);
    assert.ok(classStart >= 0 && initStart > classStart);

    const context = {
        console,
        Map,
        Set,
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: {
            location: { hostname: 'example.com' },
            getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
            addEventListener: () => {},
            removeEventListener: () => {},
            scrollTo: () => {}
        },
        document: {
            title: 'Shortcut test',
            body: { scrollHeight: 2000 },
            documentElement: { scrollHeight: 2000 },
            querySelectorAll: () => [],
            getElementById: () => null,
            addEventListener: () => {},
            removeEventListener: () => {}
        }
    };
    vm.createContext(context);
    new vm.Script(
        source.slice(classStart, initStart) + '\n;globalThis.__ShortcutsManager = ShortcutsManager;',
        { filename: 'shortcuts-manager-test.js' }
    ).runInContext(context);
    return { ShortcutsManager: context.__ShortcutsManager, context };
}

function makeManager(ShortcutsManager) {
    const manager = Object.create(ShortcutsManager.prototype);
    manager.shortcuts = [];
    manager.targetMap = new Map();
    manager.pageActions = [];
    manager.pendingChords = [];
    manager.sequenceTimer = null;
    manager.sequenceTimeout = 1200;
    manager.container = null;
    manager.statusElement = null;
    manager.setStatus = message => { manager.lastStatus = message; };
    return manager;
}

function keyEvent(key, options = {}) {
    return {
        key,
        target: options.target || { tagName: 'DIV', isContentEditable: false },
        ctrlKey: Boolean(options.ctrlKey),
        altKey: Boolean(options.altKey),
        shiftKey: Boolean(options.shiftKey),
        metaKey: Boolean(options.metaKey),
        repeat: false,
        isComposing: false,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; }
    };
}

function makeTarget({ label = 'Open details', type = 'button', inForm = false } = {}) {
    return {
        tagName: 'BUTTON',
        type,
        isConnected: true,
        disabled: false,
        innerText: label,
        clickCount: 0,
        focusCount: 0,
        classList: { add: () => {}, remove: () => {} },
        getAttribute(name) { return name === 'type' ? type : null; },
        hasAttribute: () => false,
        closest(selector) { return selector === 'form' && inForm ? {} : null; },
        scrollIntoView: () => {},
        focus() { this.focusCount += 1; },
        click() { this.clickCount += 1; }
    };
}

const { ShortcutsManager } = loadShortcutsManager();

test('normalizes modifier chords and ordered key sequences', () => {
    const manager = makeManager(ShortcutsManager);
    assert.equal(manager.parseShortcutKey('Ctrl + Enter').signature, 'ctrl+enter');
    assert.equal(manager.parseShortcutKey('Shift + ?').signature, 'shift+?');
    assert.equal(manager.parseShortcutKey('G then H').signature, 'g then h');
    assert.equal(manager.parseShortcutKey('Ctrl+K then Ctrl+S').signature, 'ctrl+k then ctrl+s');
});

test('executes G then H only after the complete ordered sequence', () => {
    const manager = makeManager(ShortcutsManager);
    const binding = manager.parseShortcutKey('G then H');
    const shortcut = { ...binding, action: 'Go home', actionType: 'scroll_top' };
    manager.shortcuts = [shortcut];
    let executions = 0;
    manager.executeShortcut = received => { executions += 1; assert.equal(received, shortcut); };

    const first = keyEvent('g');
    const second = keyEvent('h');
    assert.equal(manager.handleKeydown(first), true);
    assert.equal(first.prevented, true);
    assert.equal(executions, 0);
    assert.equal(manager.handleKeydown(second), true);
    assert.equal(second.prevented, true);
    assert.equal(executions, 1);
});

test('recognizes Ctrl+Enter including while focus is in an editable field', () => {
    const manager = makeManager(ShortcutsManager);
    const binding = manager.parseShortcutKey('Ctrl+Enter');
    manager.shortcuts = [{ ...binding, action: 'Open preview', actionType: 'activate' }];
    let executions = 0;
    manager.executeShortcut = () => { executions += 1; };
    const event = keyEvent('Enter', {
        ctrlKey: true,
        target: { tagName: 'TEXTAREA', isContentEditable: false }
    });

    assert.equal(manager.handleKeydown(event), true);
    assert.equal(event.prevented, true);
    assert.equal(executions, 1);
});

test('does not capture plain sequence keys while the user is typing', () => {
    const manager = makeManager(ShortcutsManager);
    const binding = manager.parseShortcutKey('G then H');
    manager.shortcuts = [{ ...binding, action: 'Go home', actionType: 'scroll_top' }];
    manager.executeShortcut = () => assert.fail('typing must not activate a shortcut');
    const event = keyEvent('g', { target: { tagName: 'INPUT', isContentEditable: false } });
    assert.equal(manager.handleKeydown(event), false);
    assert.equal(event.prevented, false);
});

test('invalid or unsafe activations are downgraded or rejected during preparation', () => {
    const manager = makeManager(ShortcutsManager);
    const submit = makeTarget({ label: 'Submit payment', type: 'submit', inForm: true });
    manager.targetMap.set('shortcut-target-1', submit);
    const prepared = manager.prepareShortcuts([
        { key: 'Ctrl+Enter', action: 'Submit payment', actionType: 'activate', targetId: 'shortcut-target-1' },
        { key: 'Alt+1', action: 'Missing target', actionType: 'activate', targetId: 'missing' },
        { key: 'bad+key+shape', action: 'Invalid', actionType: 'focus', targetId: 'shortcut-target-1' }
    ]);
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].actionType, 'focus');
});

test('grounded focus and activation shortcuts perform real target actions', () => {
    const manager = makeManager(ShortcutsManager);
    const target = makeTarget();
    manager.targetMap.set('shortcut-target-1', target);
    manager.highlightTarget = () => {};
    manager.highlightShortcut = () => {};
    manager.api = { log: () => {} };
    const focus = manager.prepareShortcuts([
        { key: 'Alt+Shift+1', action: 'Go to details', actionType: 'focus', targetId: 'shortcut-target-1' }
    ])[0];
    const activate = manager.prepareShortcuts([
        { key: 'Ctrl+Enter', action: 'Open details', actionType: 'activate', targetId: 'shortcut-target-1' }
    ])[0];

    assert.equal(manager.executeShortcut(focus), true);
    assert.equal(target.focusCount, 1);
    assert.equal(target.clickCount, 0);
    assert.equal(manager.executeShortcut(activate), true);
    assert.equal(target.focusCount, 2);
    assert.equal(target.clickCount, 1);
});

test('local fallback always contains working navigation bindings', () => {
    const manager = makeManager(ShortcutsManager);
    manager.pageActions = [];
    const fallback = manager.prepareShortcuts(manager.getLocalFallbackShortcuts());
    assert.equal(fallback.length, 3);
    assert.deepEqual(
        Array.from(fallback, shortcut => shortcut.actionType),
        ['scroll_top', 'scroll_bottom', 'toggle_shortcuts']
    );
});
