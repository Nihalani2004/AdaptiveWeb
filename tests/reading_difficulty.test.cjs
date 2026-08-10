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
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: {
            innerHeight: 800,
            scrollY: 0,
            location: { href: 'https://example.com/article', hostname: 'example.com' },
            getSelection: () => ({ toString: () => '' })
        },
        document: {
            hidden: false,
            activeElement: null,
            scrollingElement: { scrollTop: 0 },
            querySelector: () => null,
            querySelectorAll: () => []
        },
        localStorage: { getItem: () => null, setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {} }
    };
    vm.createContext(context);
    const isolatedSource = source.slice(configStart, nextClass) +
        '\n;globalThis.__BehaviorDetector = BehaviorDetector; globalThis.__CONFIG = CONFIG;';
    new vm.Script(isolatedSource, { filename: 'reading-difficulty-test.js' }).runInContext(context);
    return { BehaviorDetector: context.__BehaviorDetector, CONFIG: context.__CONFIG, context };
}

function loadUIAdapter() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const classStart = source.indexOf('class UIAdapter');
    const nextClass = source.indexOf('class ShortcutsManager', classStart);
    assert.ok(classStart >= 0 && nextClass > classStart);

    class MockElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.children = [];
            this.parentNode = null;
            this.attributes = new Map();
            this.listeners = new Map();
            this.id = '';
            this.textContent = '';
            this.className = '';
            this.isConnected = true;
            const values = new Set();
            this.classList = {
                add: (...items) => items.forEach(item => values.add(item)),
                remove: (...items) => items.forEach(item => values.delete(item)),
                contains: item => values.has(item),
                toggle: (item, force) => {
                    const enabled = force === undefined ? !values.has(item) : Boolean(force);
                    if (enabled) values.add(item); else values.delete(item);
                    return enabled;
                }
            };
        }
        append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
        appendChild(node) { node.parentNode = this; node.isConnected = true; this.children.push(node); return node; }
        replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
        insertAdjacentElement(position, node) {
            assert.equal(position, 'afterend');
            const index = this.parentNode.children.indexOf(this);
            node.parentNode = this.parentNode;
            node.isConnected = true;
            this.parentNode.children.splice(index + 1, 0, node);
            return node;
        }
        remove() {
            if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
            this.isConnected = false;
        }
        setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
        removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = ''; }
        addEventListener(type, listener) { this.listeners.set(type, listener); }
        click() { this.listeners.get('click')?.({ stopPropagation() {} }); }
    }

    const head = new MockElement('head');
    const body = new MockElement('body');
    const documentListeners = new Map();
    const document = {
        head,
        body,
        createElement: tag => new MockElement(tag),
        addEventListener: (type, listener) => documentListeners.set(type, listener),
        removeEventListener: (type, listener) => {
            if (documentListeners.get(type) === listener) documentListeners.delete(type);
        }
    };
    const context = { console, document, window: {}, setTimeout: () => 1, clearTimeout: () => {} };
    vm.createContext(context);
    new vm.Script(source.slice(classStart, nextClass) + '\n;globalThis.__UIAdapter = UIAdapter;').runInContext(context);
    return { UIAdapter: context.__UIAdapter, MockElement, body };
}

function findElement(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children || []) {
        const found = findElement(child, predicate);
        if (found) return found;
    }
    return null;
}

function paragraph(text = 'A '.repeat(150)) {
    return {
        innerText: text,
        textContent: text,
        isConnected: true,
        dataset: {},
        matches: selector => selector === 'p',
        closest: () => null,
        querySelectorAll: () => [],
        classList: {
            values: new Set(),
            add(...items) { items.forEach(item => this.values.add(item)); },
            remove(...items) { items.forEach(item => this.values.delete(item)); },
            contains(item) { return this.values.has(item); }
        }
    };
}

test('multi-signal scoring requires combined evidence and reaches the guarded threshold', () => {
    const { BehaviorDetector, CONFIG } = loadBehaviorDetector();
    const detector = Object.create(BehaviorDetector.prototype);
    const target = paragraph();
    detector.getDifficultyDwellThreshold = () => 4000;
    const weakEvidence = {
        visits: [9000], visible: false, visibleSince: 0, dwellMs: 4000,
        regressions: 0, selections: 0, pointerDwellMs: 0, pointerSince: 0
    };
    assert.equal(detector.calculateReadingDifficulty(target, weakEvidence, 10000).score, 0.25);

    const strongEvidence = {
        visits: [1000, 4000, 8000], visible: false, visibleSince: 0, dwellMs: 5000,
        regressions: 1, selections: 0, pointerDwellMs: 0, pointerSince: 0
    };
    const result = detector.calculateReadingDifficulty(target, strongEvidence, 10000);
    assert.equal(result.revisitCount, CONFIG.difficultyRevisitCount - 1);
    assert.equal(result.score, 0.75);
    assert.ok(result.score >= CONFIG.difficultyConfidence);
});

test('eligible paragraph guards reject short, interactive, and excluded content', () => {
    const { BehaviorDetector } = loadBehaviorDetector();
    const detector = Object.create(BehaviorDetector.prototype);
    detector.isAdaptiveWebElement = () => false;
    const short = paragraph('Too short.');
    assert.equal(detector.isBaseDifficultyParagraph(short), false);

    const excluded = paragraph();
    excluded.closest = selector => selector.includes('data-no-simplify') ? {} : null;
    assert.equal(detector.isBaseDifficultyParagraph(excluded), false);

    const interactive = paragraph();
    interactive.querySelectorAll = () => [{}, {}, {}];
    assert.equal(detector.isBaseDifficultyParagraph(interactive), false);
    assert.equal(detector.isBaseDifficultyParagraph(paragraph()), true);
});

test('difficulty event is emitted only when score and suppression guards pass', () => {
    const { BehaviorDetector } = loadBehaviorDetector();
    const detector = Object.create(BehaviorDetector.prototype);
    const target = paragraph();
    const state = {
        visits: [1000, 4000, 8000], visible: false, visibleSince: 0, dwellMs: 5000,
        regressions: 1, selections: 0, pointerDwellMs: 0, pointerSince: 0,
        prompted: false, assisted: false, dismissedUntil: 0, evaluateTimer: null
    };
    detector.paragraphStates = new WeakMap([[target, state]]);
    detector.getDifficultyDwellThreshold = () => 4000;
    detector.shouldSuppressReadingDifficulty = () => false;
    let emitted = null;
    detector.onReadingDifficulty = (node, evidence) => { emitted = { node, evidence }; };
    assert.equal(detector.evaluateReadingDifficulty(target, 10000), true);
    assert.equal(emitted.node, target);
    assert.equal(emitted.evidence.score, 0.75);

    detector.shouldSuppressReadingDifficulty = () => true;
    emitted = null;
    assert.equal(detector.evaluateReadingDifficulty(target, 11000), false);
    assert.equal(emitted, null);
});

test('local fallback preserves all source sentences and labels its limitations', () => {
    const { BehaviorDetector } = loadBehaviorDetector();
    const detector = Object.create(BehaviorDetector.prototype);
    const source = 'AdaptiveWeb monitors repeated attention. It preserves the original paragraph. Therefore users can restore it.';
    const result = detector.buildLocalReadingAssistance(source, 'example');
    assert.match(result.simplified, /AdaptiveWeb monitors repeated attention/);
    assert.match(result.simplified, /It preserves the original paragraph/);
    assert.match(result.simplified, /Therefore users can restore it/);
    assert.equal(result.method, 'local_fallback');
    assert.match(result.warnings[0], /AI was unavailable/);
});

test('implementation preserves original DOM and renders generated text safely', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    assert.match(source, /paragraph\.classList\.toggle\('aw-reading-original-hidden'/);
    assert.match(source, /text\.textContent = simplified/);
    assert.doesNotMatch(source, /updateParagraph\s*\(/);
    assert.doesNotMatch(source, /p\.innerHTML\s*=\s*text/);
});

test('accessible prompt and result preserve and fully restore the original paragraph nodes', () => {
    const { UIAdapter, MockElement, body } = loadUIAdapter();
    const ui = new UIAdapter();
    const paragraph = new MockElement('p');
    const originalNode = new MockElement('span');
    originalNode.textContent = 'Original content and inline link stay here.';
    paragraph.appendChild(originalNode);
    body.appendChild(paragraph);

    let chosenMode = null;
    assert.equal(ui.showReadingDifficultyPrompt(paragraph, { onAction: mode => { chosenMode = mode; } }), true);
    const prompt = findElement(body, element => element.className.includes('aw-reading-difficulty-prompt'));
    assert.equal(prompt.getAttribute('role'), 'dialog');
    findElement(prompt, element => element.textContent === 'Simplify').click();
    assert.equal(chosenMode, 'simplify');
    assert.equal(paragraph.children[0], originalNode);

    let closeReason = null;
    const requestId = ui.showReadingAssistanceLoading(paragraph, { onClose: reason => { closeReason = reason; } });
    const panel = findElement(body, element => element.className.includes('aw-reading-assistance-panel'));
    assert.equal(panel.getAttribute('role'), 'region');
    assert.equal(panel.getAttribute('aria-busy'), 'true');
    assert.equal(ui.showReadingAssistanceResult(paragraph, {
        requestId,
        mode: 'simplify',
        sourceLabel: 'Local explanation',
        result: { simplified: 'A simpler explanation.', keyTerms: [], warnings: [] }
    }), true);
    assert.equal(panel.getAttribute('aria-busy'), 'false');

    findElement(panel, element => element.textContent === 'Use simplified view').click();
    assert.equal(paragraph.classList.contains('aw-reading-original-hidden'), true);
    assert.equal(paragraph.getAttribute('aria-hidden'), 'true');
    findElement(panel, element => element.textContent === 'Close and restore original').click();
    assert.equal(closeReason, 'close-and-restore');
    assert.equal(paragraph.classList.contains('aw-reading-original-hidden'), false);
    assert.equal(paragraph.getAttribute('aria-hidden'), null);
    assert.equal(paragraph.children[0], originalNode);
    assert.equal(ui.readingAssistanceEntries.size, 0);
});
