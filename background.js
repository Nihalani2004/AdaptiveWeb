const AW_DEFAULT_CONTROL_PLANE = 'http://localhost:3000';
const AW_SYNC_ALARM = 'adaptiveweb-preference-sync';

function isAllowedControlPlane(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch { return false; }
}

async function getState() {
  return chrome.storage.local.get(['awControlPlane', 'awExtensionToken', 'awPreferencesCache', 'awAccount', 'awLastSync', 'awSyncError']);
}

async function request(path, options = {}) {
  const state = await getState();
  const base = state.awControlPlane || AW_DEFAULT_CONTROL_PLANE;
  if (!isAllowedControlPlane(base)) throw new Error('Use HTTPS, or localhost for development.');
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
  const normalizedControlPlane = String(controlPlane || AW_DEFAULT_CONTROL_PLANE).replace(/\/$/, '');
  if (!isAllowedControlPlane(normalizedControlPlane)) throw new Error('Use an HTTPS server URL, or localhost for development.');
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
  };
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve(handler()).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error && typeof error.message === 'string' ? error.message : 'Extension request failed.' }));
  return true;
});
