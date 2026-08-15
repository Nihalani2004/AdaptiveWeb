const AW_DEFAULT_CONTROL_PLANE = 'http://localhost:3000';
const AW_DEFAULT_BACKEND_URL = 'http://localhost:8000';
const AW_SYNC_ALARM = 'adaptiveweb-preference-sync';
const AW_BACKEND_ENDPOINTS = new Set(['suggest', 'analytics', 'simplify', 'summarize', 'related', 'shortcuts']);
const AW_BACKEND_AI_ENDPOINTS = new Set(['suggest', 'simplify', 'summarize', 'shortcuts']);
const AW_MAX_BACKEND_REQUEST_BYTES = 64 * 1024;
const AW_MAX_BACKEND_RESPONSE_BYTES = 1024 * 1024;

function normalizeServiceUrl(value, fallback) {
  const raw = String(value || fallback || '').trim();
  if (!raw || raw.length > 2048) throw new Error('Enter a valid server URL.');
  try {
    const url = new URL(raw);
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    const localHttp = url.protocol === 'http:' && localHosts.has(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) {
      throw new Error('Use HTTPS, or HTTP only for localhost development.');
    }
    if (url.username || url.password) throw new Error('Server URLs cannot contain credentials.');
    if (url.search || url.hash) throw new Error('Server URLs cannot contain query parameters or fragments.');
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    if (/\/api$/i.test(path)) throw new Error('Enter the server base URL without /api.');
    return `${url.origin}${path}`;
  } catch (error) {
    if (error instanceof Error && /^(Use HTTPS|Server URLs|Enter a valid)/.test(error.message)) throw error;
    throw new Error('Enter a valid server URL.');
  }
}

async function getState() {
  return chrome.storage.local.get([
    'awControlPlane', 'awBackendBaseUrl', 'awBackendLastCheck', 'awBackendError',
    'awExtensionToken', 'awPreferencesCache', 'awAccount', 'awLastSync', 'awSyncError'
  ]);
}

async function request(path, options = {}) {
  const state = await getState();
  const base = normalizeServiceUrl(state.awControlPlane, AW_DEFAULT_CONTROL_PLANE);
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.awExtensionToken) headers.Authorization = `Bearer ${state.awExtensionToken}`;
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readBoundedJson(response) {
  const declaredLength = Number(response?.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > AW_MAX_BACKEND_RESPONSE_BYTES) {
    throw new Error('Backend response is too large.');
  }
  if (typeof response?.text === 'function') {
    const text = await response.text();
    if (text.length > AW_MAX_BACKEND_RESPONSE_BYTES) throw new Error('Backend response is too large.');
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { throw new Error('Backend returned an invalid JSON response.'); }
  }
  if (typeof response?.json === 'function') {
    const data = await response.json();
    if (JSON.stringify(data).length > AW_MAX_BACKEND_RESPONSE_BYTES) throw new Error('Backend response is too large.');
    return data;
  }
  throw new Error('Backend returned an invalid response.');
}

async function fetchBackend(baseUrl, path, options = {}, timeoutMs = 7000) {
  const base = normalizeServiceUrl(baseUrl, AW_DEFAULT_BACKEND_URL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
    const data = await readBoundedJson(response);
    if (!response.ok) {
      const detail = data?.error || data?.detail;
      const error = new Error(typeof detail === 'string' ? detail : `Backend request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Backend request timed out.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestBackend(endpoint, body) {
  if (!AW_BACKEND_ENDPOINTS.has(endpoint)) throw new Error('Unsupported backend endpoint.');
  const serialized = JSON.stringify(body ?? {});
  if (serialized.length > AW_MAX_BACKEND_REQUEST_BYTES) throw new Error('Backend request is too large.');
  const state = await getState();
  const timeoutMs = AW_BACKEND_AI_ENDPOINTS.has(endpoint) ? 19000 : 7000;
  return fetchBackend(state.awBackendBaseUrl, `/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serialized,
  }, timeoutMs);
}

async function saveBackendConfiguration(value) {
  const backendBaseUrl = normalizeServiceUrl(value, AW_DEFAULT_BACKEND_URL);
  await chrome.storage.local.set({ awBackendBaseUrl: backendBaseUrl, awBackendError: '' });
  return { backendBaseUrl };
}

async function testBackendConfiguration(value, saveOnSuccess = false) {
  const backendBaseUrl = normalizeServiceUrl(value, AW_DEFAULT_BACKEND_URL);
  try {
    const health = await fetchBackend(backendBaseUrl, '/health', { method: 'GET' }, 7000);
    if (health?.status !== 'ok') throw new Error('Backend health check did not return status ok.');
    const checkedAt = new Date().toISOString();
    const update = { awBackendLastCheck: checkedAt, awBackendError: '' };
    if (saveOnSuccess) update.awBackendBaseUrl = backendBaseUrl;
    await chrome.storage.local.set(update);
    return { backendBaseUrl, checkedAt, status: health.status, saved: Boolean(saveOnSuccess) };
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : 'Backend health check failed.';
    await chrome.storage.local.set({ awBackendError: message });
    throw new Error(message);
  }
}

async function resetBackendConfiguration() {
  await chrome.storage.local.remove(['awBackendBaseUrl', 'awBackendLastCheck', 'awBackendError']);
  return { backendBaseUrl: AW_DEFAULT_BACKEND_URL };
}

async function syncPreferences() {
  const state = await getState();
  if (!state.awExtensionToken) return { connected: false, preferences: state.awPreferencesCache || null };
  try {
    const data = await request('/api/extension/preferences');
    const now = new Date().toISOString();
    await chrome.storage.local.set({ awPreferencesCache: data.preferences, awAccount: data.account, awLastSync: now, awSyncError: '' });
    return { connected: true, preferences: data.preferences, account: data.account, lastSync: now, revision: data.revision };
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : 'Sync failed.';
    if (error?.status === 401) {
      await chrome.storage.local.remove(['awExtensionToken', 'awAccount', 'awLastSync']);
      await chrome.storage.local.set({ awSyncError: message });
      return { connected: false, preferences: state.awPreferencesCache || null, error: message, cached: true };
    }
    await chrome.storage.local.set({ awSyncError: message });
    // Last-known-good preferences remain active when the server is unavailable.
    return { connected: true, preferences: state.awPreferencesCache || null, account: state.awAccount || null, lastSync: state.awLastSync || null, error: message, cached: true };
  }
}

async function pairExtension(code, controlPlane) {
  const normalizedControlPlane = normalizeServiceUrl(controlPlane, AW_DEFAULT_CONTROL_PLANE);
  await chrome.storage.local.set({ awControlPlane: normalizedControlPlane });
  const normalizedCode = String(code || '').replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
  if (normalizedCode.length !== 10) throw new Error('Enter the 10-character pairing code.');
  const data = await request('/api/extension/pair/exchange', { method: 'POST', body: JSON.stringify({ code: normalizedCode }) });
  await chrome.storage.local.set({ awExtensionToken: data.token, awPreferencesCache: data.preferences, awAccount: data.account, awLastSync: new Date().toISOString(), awSyncError: '' });
  return { connected: true, preferences: data.preferences, account: data.account };
}

async function disconnectExtension() {
  const state = await getState();
  if (state.awExtensionToken) {
    try { await request('/api/extension/disconnect', { method: 'DELETE' }); } catch { /* Local disconnect must still succeed. */ }
  }
  await chrome.storage.local.remove(['awExtensionToken', 'awPreferencesCache', 'awAccount', 'awLastSync', 'awSyncError']);
  return { connected: false };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(AW_SYNC_ALARM, { periodInMinutes: 15 });
  void syncPreferences();
});
chrome.runtime.onStartup.addListener(() => void syncPreferences());
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === AW_SYNC_ALARM) void syncPreferences(); });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    AW_GET_PREFERENCES: async () => {
      const state = await getState();
      return { connected: Boolean(state.awExtensionToken), preferences: state.awPreferencesCache || null, account: state.awAccount || null, lastSync: state.awLastSync || null, error: state.awSyncError || '' };
    },
    AW_PAIR: () => pairExtension(message.code, message.controlPlane),
    AW_SYNC_NOW: syncPreferences,
    AW_DISCONNECT: disconnectExtension,
    AW_GET_SYNC_STATE: async () => {
      const state = await getState();
      return { awControlPlane: state.awControlPlane || AW_DEFAULT_CONTROL_PLANE, connected: Boolean(state.awExtensionToken), account: state.awAccount || null, lastSync: state.awLastSync || null, error: state.awSyncError || '' };
    },
    AW_GET_BACKEND_CONFIG: async () => {
      const state = await getState();
      let backendBaseUrl = AW_DEFAULT_BACKEND_URL;
      try { backendBaseUrl = normalizeServiceUrl(state.awBackendBaseUrl, AW_DEFAULT_BACKEND_URL); } catch { /* Use the safe default. */ }
      return { backendBaseUrl, lastCheck: state.awBackendLastCheck || null, error: state.awBackendError || '' };
    },
    AW_SET_BACKEND_CONFIG: () => saveBackendConfiguration(message.backendBaseUrl),
    AW_TEST_BACKEND: () => testBackendConfiguration(message.backendBaseUrl, message.saveOnSuccess === true),
    AW_RESET_BACKEND_CONFIG: resetBackendConfiguration,
    AW_BACKEND_REQUEST: () => requestBackend(message.endpoint, message.body),
  };
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve(handler()).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error && typeof error.message === 'string' ? error.message : 'Extension request failed.' }));
  return true;
});
