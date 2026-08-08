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
        localStorage: { getItem: () => null, setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {} }
    };
    vm.createContext(context);
    const isolatedSource =
        source.slice(configStart, classStart) +
        source.slice(classStart, nextClass) +
        '\n;globalThis.__BehaviorDetector = BehaviorDetector; globalThis.__CONFIG = CONFIG;';
    new vm.Script(isolatedSource, { filename: 'scroll-summary-test.js' }).runInContext(context);
    return { BehaviorDetector: context.__BehaviorDetector, CONFIG: context.__CONFIG };
}

const { BehaviorDetector, CONFIG } = loadScrollDetector();

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
