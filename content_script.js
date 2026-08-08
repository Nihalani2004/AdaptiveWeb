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
  };
  (document.head || document.documentElement).appendChild(script);

  // API Proxy Listener to prevent HTTPS Mixed Content errors
  window.addEventListener('message', async function(event) {
    if (event.source === window && event.data && event.data.type === 'AW_API_REQUEST') {
      const { requestId, endpoint, body } = event.data;
      const allowedEndpoints = new Set(['suggest', 'analytics', 'simplify', 'summarize', 'related', 'shortcuts']);
      if (!allowedEndpoints.has(endpoint) || typeof requestId !== 'string') return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint === 'suggest' ? 16000 : 7000);
      try {
        const response = await fetch(`http://localhost:8000/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const data = await response.json();
        window.postMessage({
          type: 'AW_API_RESPONSE',
          requestId,
          data: response.ok ? data : null,
          error: response.ok ? null : `HTTP ${response.status}`
        }, '*');
      } catch (err) {
        window.postMessage({ type: 'AW_API_RESPONSE', requestId, data: null, error: err.message }, '*');
      } finally {
        clearTimeout(timeoutId);
      }
    }
  });
})();
