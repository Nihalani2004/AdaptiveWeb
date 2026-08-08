const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScrollDetector() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'injected.js'), 'utf8');
    const configStart = source.indexOf('const CONFIG');
    const classStart = source.indexOf('class BehaviorDetector');
    const nextClass = source.indexOf('class ApiService', classStart);
    assert.ok(configStart >= 0 && classStart >= 0 && nextClass > classStart);

    const context = {
        console,
        URL,
        performance: { now: () => 0 },
        setTimeout: () => 1,
        clearTimeout: () => {},
        window: { innerWidth: 1280, innerHeight: 720, location: { hostname: 'example.com' } },
        document: { title: 'Scroll test', body: {}, documentElement: {}, querySelector: () => null, querySelectorAll: () => [] },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    };
    vm.createContext(context);
    const isolatedSource =
        source.slice(configStart, classStart) +
        source.slice(classStart, nextClass) +
        '\n;globalThis.__BehaviorDetector = BehaviorDetector; globalThis.__CONFIG = CONFIG;';
    new vm.Script(isolatedSource, { filename: 'scroll-summary-test.js' }).runInContext(context);
    return { BehaviorDetector: context.__BehaviorDetector, CONFIG: context.__CONFIG, context };
}

const { BehaviorDetector, CONFIG, context } = loadScrollDetector();

function makeClassList() {
    const values = new Set();
    return {
        add(...names) { names.forEach(name => values.add(name)); },
        remove(...names) { names.forEach(name => values.delete(name)); },
        contains(name) { return values.has(name); },
        values
    };
}

function makeElement(tagName = 'div') {
    const attributes = new Map();
    return {
        tagName: tagName.toUpperCase(),
        id: '',
        dataset: {},
        hidden: false,
        removed: false,
        children: [],
        listeners: {},
        className: '',
        classList: makeClassList(),
        append(...children) { this.children.push(...children); },
        addEventListener(type, handler) { this.listeners[type] = handler; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) || null; },
        removeAttribute(name) {
            attributes.delete(name);
            if (name === 'id') this.id = '';
        },
        remove() { this.removed = true; },
        closest: () => null,
        matches: () => false,
        querySelectorAll: () => []
    };
}

function detectorAndTracker(range = 1000) {
    const detector = Object.create(BehaviorDetector.prototype);
    const metrics = { position: 0, range, depth: 0, viewportSize: 500, scrollHeight: range + 500 };
    return { detector, tracker: detector.createScrollTracker(metrics, 0), range };
}

function sample(detector, tracker, position, now, range = 1000) {
    return detector.processScrollSample(tracker, {
        position,
        range,
        depth: position / range,
        viewportSize: 500,
        scrollHeight: range + 500
    }, now);
}

test('deep rapid scroll followed by a timely return triggers one summary', () => {
    const { detector, tracker, range } = detectorAndTracker();
    const results = [
        sample(detector, tracker, 150, 100, range),
        sample(detector, tracker, 350, 200, range),
        sample(detector, tracker, 600, 300, range),
        sample(detector, tracker, 860, 400, range),
        sample(detector, tracker, 650, 500, range),
        sample(detector, tracker, 400, 600, range),
        sample(detector, tracker, 190, 700, range)
    ];

    assert.equal(results.filter(result => result.rapidSkim).length, 1);
    assert.equal(results.filter(result => result.triggerSummary).length, 1);
    assert.equal(results.at(-1).metadata.maxDepth, 0.86);
    assert.equal(tracker.state, 'cooldown');
});

test('shallow scrolling and returning does not trigger a summary', () => {
    const { detector, tracker, range } = detectorAndTracker();
    [150, 350, 600, 300, 100].forEach((position, index) => {
        const result = sample(detector, tracker, position, (index + 1) * 100, range);
        assert.equal(result.triggerSummary, false);
    });
    assert.equal(tracker.reachedBottomAt, 0);
});

test('a slow deep read is not mislabeled as a rapid skim', () => {
    const { detector, tracker, range } = detectorAndTracker();
    let finalResult;
    [200, 450, 700, 860, 600, 350, 190].forEach((position, index) => {
        finalResult = sample(detector, tracker, position, (index + 1) * 1800, range);
    });
    assert.equal(tracker.fastEventTotal, 0);
    assert.equal(finalResult.triggerSummary, false);
});

test('high-frequency events accumulate until the configured sample interval', () => {
    const { detector, tracker, range } = detectorAndTracker();
    const ignored = sample(detector, tracker, 100, 10, range);
    const accepted = sample(detector, tracker, 200, CONFIG.scrollSampleInterval + 10, range);
    assert.equal(ignored.triggerSummary, false);
    assert.equal(accepted.triggerSummary, false);
    assert.equal(tracker.totalDownward, 200);
});

test('local summary uses content lines and excludes prompt metadata', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const summary = detector.buildLocalScrollSummary([
        'Page title: Example',
        'Content source: scrollable section',
        'Behavior: The user skimmed.',
        '[H2] Direction reversal confirms the reader intentionally returned to earlier content.',
        '[TEXT] Sensitive text is redacted before any remote summary request is created.',
        '[TEXT] A local fallback remains available when the backend cannot be reached.'
    ].join('\n'));
    assert.match(summary, /Direction reversal/);
    assert.match(summary, /Sensitive text/);
    assert.doesNotMatch(summary, /Page title:/);
});

test('local fallback can extract three takeaways from one content block', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const summary = detector.buildLocalScrollSummary(
        '[TEXT] Direction tracking confirms intentional movement. Timing windows reject stale gestures. A local fallback keeps the result available.'
    );
    assert.equal(summary.split('\n').length, 3);
});

test('redaction removes common personal-data patterns from summary context', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const redacted = detector.redactSensitiveText('Email reader@example.com or call +91 98765 43210 with card 4111 1111 1111 1111.');
    assert.doesNotMatch(redacted, /reader@example\.com/);
    assert.doesNotMatch(redacted, /98765 43210/);
    assert.doesNotMatch(redacted, /4111 1111 1111 1111/);
});

test('rapid-skim detection schedules independent compact-reading assistance', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    let scheduled = 0;
    detector.ui = { showScrollToast: () => {} };
    detector.api = { log: () => {} };
    detector.scheduleTldrAssistance = () => { scheduled += 1; };
    detector.onRapidSkimDetected(context.window, { maxDepth: 0.4, fastEventTotal: 3 });
    assert.equal(scheduled, 1);
});

test('semantic preview favors an informative sentence over demo instructions', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const keySentence = detector.selectTldrKeySentence(
        'Try scrolling quickly through this demonstration. Direction tracking ensures that compact reading activates only after a confident rapid-skim pattern. Short note.'
    );
    assert.match(keySentence, /Direction tracking ensures/);
});

test('TLDR paragraph preparation preserves original content and supports reversible controls', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    detector.tldrParagraphId = 0;
    context.document.createElement = tagName => makeElement(tagName);
    const paragraph = makeElement('p');
    paragraph.innerText = 'Adaptive interfaces preserve the original paragraph while selecting a concise and meaningful key sentence for the compact preview. '.repeat(3);
    const inserted = {};
    paragraph.insertAdjacentElement = (position, element) => { inserted[position] = element; };
    const session = { entries: new Map() };

    const entry = detector.prepareTldrParagraph(paragraph, session);
    assert.ok(entry);
    assert.equal(paragraph.dataset.awTldrPrepared, 'true');
    assert.ok(paragraph.classList.contains('aw-tldr-collapsed'));
    assert.ok(paragraph.classList.contains('aw-tldr-original-hidden'));
    assert.equal(entry.toggle.textContent, 'Read full paragraph');
    assert.equal(entry.toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(inserted.beforebegin, entry.preview);
    assert.equal(inserted.afterend, entry.toggle);

    entry.toggle.listeners.click();
    assert.equal(entry.expanded, true);
    assert.equal(entry.preview.hidden, true);
    assert.equal(entry.toggle.textContent, 'Show key point');
    assert.equal(entry.toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(!paragraph.classList.contains('aw-tldr-original-hidden'));

    detector.restoreTldrEntry(entry);
    assert.equal(paragraph.dataset.awTldrPrepared, undefined);
    assert.ok(!paragraph.classList.contains('aw-tldr-collapsed'));
    assert.equal(entry.preview.removed, true);
    assert.equal(entry.toggle.removed, true);
});

test('scroll-back summary remains independent from TLDR mode', async () => {
    const detector = Object.create(BehaviorDetector.prototype);
    let tldrApplications = 0;
    detector.shouldSuppressScrollSummary = () => false;
    detector.getScrollSummaryCount = () => 0;
    detector.setScrollSummaryCount = () => {};
    detector.buildScrollSummaryText = () => '[TEXT] One useful point. A second useful point. A third useful point.';
    detector.buildLocalScrollSummary = BehaviorDetector.prototype.buildLocalScrollSummary;
    detector.applyRapidSkimMode = () => { tldrApplications += 1; };
    detector.ui = {
        showScrollSummaryLoading: () => 9,
        showScrollSummary: () => true
    };
    detector.api = { log: () => {}, summarize: async () => null };

    await detector.onScrollBackSummaryDetected(context.window, {}, {
        maxDepth: 0.9,
        downwardTravelRatio: 0.9,
        returnTravelRatio: 0.7,
        gestureDuration: 1000,
        averageSpeed: 900,
        fastEventTotal: 4
    });
    assert.equal(tldrApplications, 0);
});

test('TLDR Ask mode waits for scrolling to become idle before offering compact view', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    let idleCallback;
    let promptOptions;
    let applications = 0;
    const originalSetTimeout = context.setTimeout;
    context.setTimeout = callback => {
        idleCallback = callback;
        return 77;
    };
    detector.tldrIdleTimers = new Map();
    detector.tldrSessions = new Map();
    detector.getTldrPreference = () => 'ask';
    detector.applyRapidSkimMode = () => { applications += 1; };
    detector.ui = { showTldrPrompt: options => { promptOptions = options; } };
    detector.api = { log: () => {} };
    const tracker = { tldrHandled: false };

    detector.scheduleTldrAssistance(context.window, tracker);
    assert.equal(tracker.tldrHandled, false);
    assert.equal(typeof idleCallback, 'function');
    idleCallback();
    assert.equal(tracker.tldrHandled, true);
    assert.ok(promptOptions);
    assert.equal(applications, 0);
    promptOptions.onApply();
    assert.equal(applications, 1);
    context.setTimeout = originalSetTimeout;
});

test('TLDR preferences support persistent Ask/Automatic and reversible per-tab Off', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const localValues = new Map();
    const sessionValues = new Map();
    context.localStorage = {
        getItem: key => localValues.get(key) || null,
        setItem: (key, value) => localValues.set(key, value),
        removeItem: key => localValues.delete(key)
    };
    context.sessionStorage = {
        getItem: key => sessionValues.get(key) || null,
        setItem: (key, value) => sessionValues.set(key, value),
        removeItem: key => sessionValues.delete(key)
    };

    detector.setTldrPreference('auto');
    assert.equal(detector.getTldrPreference(), 'auto');
    detector.setTldrPreference('off');
    assert.equal(detector.getTldrPreference(), 'off');
    detector.setTldrPreference('ask');
    assert.equal(detector.getTldrPreference(), 'ask');
});

test('TLDR candidate processing avoids duplicate controls on dynamic-content rescans', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    detector.tldrParagraphId = 0;
    detector.isAdaptiveWebElement = () => false;
    context.document.createElement = tagName => makeElement(tagName);
    const paragraphs = [makeElement('p'), makeElement('p')];
    paragraphs.forEach((paragraph, index) => {
        paragraph.innerText = `Dynamic paragraph ${index + 1} provides a meaningful explanation that remains long enough for compact reading. `.repeat(4);
        paragraph.insertAdjacentElement = () => {};
    });
    const session = {
        active: true,
        root: { querySelectorAll: selector => selector === 'p' ? paragraphs : [] },
        entries: new Map()
    };

    assert.equal(detector.processTldrCandidates(session), 2);
    assert.equal(detector.processTldrCandidates(session), 0);
    assert.equal(session.entries.size, 2);
});

test('TLDR mutations preserve relative progress in nested scroll containers', () => {
    const detector = Object.create(BehaviorDetector.prototype);
    const source = { scrollTop: 500 };
    let metricsCall = 0;
    let mutated = false;
    detector.getScrollMetrics = () => {
        metricsCall += 1;
        return metricsCall === 1
            ? { position: 500, range: 1000, depth: 0.5 }
            : { position: 500, range: 600, depth: 5 / 6 };
    };
    detector.preserveTldrScrollPosition(source, () => { mutated = true; });
    assert.equal(mutated, true);
    assert.equal(source.scrollTop, 300);
    assert.ok(detector.scrollProgrammaticUntil > 0);
});
