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

  function runtimeIsAvailable() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function runtimeErrorMessage(error) {
    if (error && typeof error.message === 'string' && error.message) return error.message;
    return 'AdaptiveWeb was reloaded. Refresh this page to reconnect the extension.';
  }

  function postApiResponse(requestId, data = null, error = null) {
    window.postMessage({
      type: 'AW_API_RESPONSE',
      requestId,
      data,
      error
    }, '*');
  }

  function sendPreferencesToPage() {
    if (!runtimeIsAvailable()) return;
    try {
      chrome.runtime.sendMessage({ type: 'AW_GET_PREFERENCES' }, function(response) {
        let lastError = null;
        try { lastError = chrome.runtime?.lastError?.message || null; } catch { lastError = 'Extension context invalidated.'; }
        if (lastError || !response?.ok || !response.preferences) return;
        window.postMessage({ type: 'AW_PREFERENCES_UPDATE', preferences: response.preferences }, '*');
      });
    } catch {
      // A tab can retain an old content script after the extension is reloaded.
      // There is no usable preference channel until the user refreshes that tab.
    }
  }

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && changes.awPreferencesCache?.newValue) {
      window.postMessage({ type: 'AW_PREFERENCES_UPDATE', preferences: changes.awPreferencesCache.newValue }, '*');
    }
  });

  const allowedApiEndpoints = new Set(['suggest', 'analytics', 'simplify', 'summarize', 'related', 'shortcuts']);

  // The background worker owns the configured FastAPI URL and all cross-origin requests.
  // Page messages may choose only a bounded endpoint, never a destination URL.
  window.addEventListener('message', function(event) {
    if (event.source === window && event.data?.type === 'AW_REQUEST_PREFERENCES') {
      sendPreferencesToPage();
      return;
    }
    if (event.source === window && event.data && event.data.type === 'AW_API_REQUEST') {
      const { requestId, endpoint, body } = event.data;
      if (!allowedApiEndpoints.has(endpoint) || typeof requestId !== 'string' || requestId.length > 80) return;
      if (!runtimeIsAvailable()) {
        postApiResponse(requestId, null, 'AdaptiveWeb was reloaded. Refresh this page to reconnect the extension.');
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: 'AW_BACKEND_REQUEST', endpoint, body }, function(response) {
          let runtimeError = null;
          try { runtimeError = chrome.runtime?.lastError?.message || null; } catch { runtimeError = 'Extension context invalidated.'; }
          postApiResponse(requestId, !runtimeError && response?.ok ? response : null, runtimeError || response?.error || null);
        });
      } catch (error) {
        postApiResponse(requestId, null, runtimeErrorMessage(error));
      }
    }
  });
})();
