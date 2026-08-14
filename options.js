const pairSection = document.getElementById('pair-section');
const connectedSection = document.getElementById('connected-section');
const status = document.getElementById('status');
const server = document.getElementById('server');
const code = document.getElementById('code');

function message(type, payload = {}) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...payload }, resolve));
}

function setStatus(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }

async function render() {
  const response = await message('AW_GET_PREFERENCES');
  const connected = Boolean(response?.connected);
  pairSection.hidden = connected; connectedSection.hidden = !connected;
  if (connected) {
    document.getElementById('account').textContent = response.account ? `${response.account.name} · ${response.account.email}` : 'Connected account';
    document.getElementById('last-sync').textContent = response.lastSync ? `Last successful sync: ${new Date(response.lastSync).toLocaleString()}` : 'Waiting for first sync.';
    setStatus(response.error ? `Using saved settings: ${response.error}` : 'Preferences are synced.', Boolean(response.error));
  } else { setStatus(response?.error || 'Generate a pairing code from the AdaptiveWeb website Settings page.', Boolean(response?.error)); }
  const state = await message('AW_GET_SYNC_STATE');
  if (state?.awControlPlane) server.value = state.awControlPlane;
}

document.getElementById('pair').addEventListener('click', async () => {
  setStatus('Connecting…');
  const response = await message('AW_PAIR', { code: code.value, controlPlane: server.value });
  if (!response?.ok) return setStatus(response?.error || 'Unable to connect.', true);
  code.value = ''; await render();
});
document.getElementById('sync').addEventListener('click', async () => {
  setStatus('Syncing…'); const response = await message('AW_SYNC_NOW');
  if (!response?.ok || response.error) setStatus(response?.error || 'Unable to sync.', true); else await render();
});
document.getElementById('disconnect').addEventListener('click', async () => {
  setStatus('Disconnecting…'); const response = await message('AW_DISCONNECT');
  if (!response?.ok) setStatus(response?.error || 'Unable to disconnect.', true); else await render();
});
void render();
