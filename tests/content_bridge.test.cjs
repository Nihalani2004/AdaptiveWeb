const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadContentBridge({ runtimeId = 'extension-id', sendMessage } = {}) {
    const listeners = new Map();
    const postedMessages = [];
    const window = {
        AdaptiveWebInjected: false,
        postMessage(message) { postedMessages.push(message); },
        addEventListener(type, listener) { listeners.set(type, listener); },
    };
    const document = {
        head: { appendChild() {} },
        documentElement: { appendChild() {} },
        createElement() { return { remove() {} }; },
    };
    const chrome = {
        runtime: {
            id: runtimeId,
            getURL: value => `chrome-extension://extension-id/${value}`,
            sendMessage: sendMessage || (() => {}),
        },
        storage: { onChanged: { addListener() {} } },
    };
    const context = { window, document, chrome, console };
    vm.createContext(context);
    new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'content_script.js'), 'utf8'), { filename: 'content-bridge-test.js' }).runInContext(context);
    return { chrome, listeners, postedMessages, window };
}

test('content bridge returns a bounded error instead of throwing after extension context invalidation', () => {
    const runtime = loadContentBridge();
    runtime.chrome.runtime.id = undefined;
    const messageListener = runtime.listeners.get('message');

    assert.doesNotThrow(() => messageListener({
        source: runtime.window,
        data: { type: 'AW_API_REQUEST', requestId: 'reload-test', endpoint: 'summarize', body: { text: 'Example' } },
    }));
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.postedMessages.at(-1))), {
        type: 'AW_API_RESPONSE',
        requestId: 'reload-test',
        data: null,
        error: 'AdaptiveWeb was reloaded. Refresh this page to reconnect the extension.',
    });
});

test('content bridge catches a sendMessage context failure and returns it to the page', () => {
    const runtime = loadContentBridge({
        sendMessage() { throw new Error('Extension context invalidated.'); },
    });
    const messageListener = runtime.listeners.get('message');

    assert.doesNotThrow(() => messageListener({
        source: runtime.window,
        data: { type: 'AW_API_REQUEST', requestId: 'send-failure', endpoint: 'suggest', body: {} },
    }));
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.postedMessages.at(-1))), {
        type: 'AW_API_RESPONSE',
        requestId: 'send-failure',
        data: null,
        error: 'Extension context invalidated.',
    });
});
