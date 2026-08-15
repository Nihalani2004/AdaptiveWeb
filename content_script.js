(function() {
  // Prevent duplicate injection
  if (window.AdaptiveWebInjected) return;
  window.AdaptiveWebInjected = true;

  console.log('AdaptiveWeb: Initializing injection...');

  // Inject CSS
  const link = document.createElement('link');
  link.href = chrome.runtime.getURL('injected.css');
  link.type = 'text/css';
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  // Inject JS
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
    sendPreferencesToPage();
  };
  (document.head || document.documentElement).appendChild(script);

  function sendPreferencesToPage() {
    chrome.runtime.sendMessage({ type: 'AW_GET_PREFERENCES' }, function(response) {
      if (chrome.runtime.lastError || !response?.ok || !response.preferences) return;
      window.postMessage({ type: 'AW_PREFERENCES_UPDATE', preferences: response.preferences }, '*');
    });
  }

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && changes.awPreferencesCache?.newValue) {
      window.postMessage({ type: 'AW_PREFERENCES_UPDATE', preferences: changes.awPreferencesCache.newValue }, '*');
    }
  });

  const allowedApiEndpoints = new Set(['suggest', 'analytics', 'simplify', 'summarize', 'related', 'shortcuts']);

  // The background worker owns the configured FastAPI URL and all cross-origin requests.
  // Page messages may choose only a bounded endpoint, never a destination URL.
  window.addEventListener('message', async function(event) {
    if (event.source === window && event.data?.type === 'AW_REQUEST_PREFERENCES') {
      sendPreferencesToPage();
      return;
    }
    if (event.source === window && event.data && event.data.type === 'AW_API_REQUEST') {
      const { requestId, endpoint, body } = event.data;
      if (!allowedApiEndpoints.has(endpoint) || typeof requestId !== 'string' || requestId.length > 80) return;
      chrome.runtime.sendMessage({ type: 'AW_BACKEND_REQUEST', endpoint, body }, function(response) {
        const runtimeError = chrome.runtime.lastError?.message;
        window.postMessage({
          type: 'AW_API_RESPONSE',
          requestId,
          data: !runtimeError && response?.ok ? response : null,
          error: runtimeError || response?.error || null
        }, '*');
      });
    }
  });
})();
