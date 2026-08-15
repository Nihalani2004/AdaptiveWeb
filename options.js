const pairSection = document.getElementById('pair-section');
const connectedSection = document.getElementById('connected-section');
const status = document.getElementById('status');
const controlPlane = document.getElementById('control-plane');
const backendServer = document.getElementById('backend-server');
const backendStatus = document.getElementById('backend-status');
const code = document.getElementById('code');

function message(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'The extension background worker did not respond.' });
    });
  });
}

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function setBackendStatus(text, tone = '') {
  backendStatus.textContent = text;
  backendStatus.classList.toggle('error', tone === 'error');
  backendStatus.classList.toggle('success', tone === 'success');
}

function setBackendBusy(busy) {
  ['save-backend', 'test-backend', 'reset-backend'].forEach((id) => {
    document.getElementById(id).disabled = busy;
  });
}

async function renderBackendConfiguration() {
  const response = await message('AW_GET_BACKEND_CONFIG');
  if (!response?.ok) {
    setBackendStatus(response?.error || 'Unable to load the FastAPI configuration.', 'error');
    return;
  }
  backendServer.value = response.backendBaseUrl;
  if (response.error) {
    setBackendStatus(`Last connection check failed: ${response.error}`, 'error');
  } else if (response.lastCheck) {
    setBackendStatus(`Connected successfully ${new Date(response.lastCheck).toLocaleString()}.`, 'success');
  } else {
    setBackendStatus('The URL is saved locally. Use Test and save to verify the FastAPI health endpoint.');
  }
}

async function render() {
  const [response, state] = await Promise.all([
    message('AW_GET_PREFERENCES'),
    message('AW_GET_SYNC_STATE'),
  ]);
  const connected = Boolean(response?.connected);
  pairSection.hidden = connected;
  connectedSection.hidden = !connected;
  if (connected) {
    document.getElementById('account').textContent = response.account ? `${response.account.name} - ${response.account.email}` : 'Connected account';
    document.getElementById('last-sync').textContent = response.lastSync ? `Last successful sync: ${new Date(response.lastSync).toLocaleString()}` : 'Waiting for first sync.';
    setStatus(response.error ? `Using saved settings: ${response.error}` : 'Preferences are synced.', Boolean(response.error));
  } else {
    setStatus(response?.error || 'Generate a pairing code from the AdaptiveWeb website Settings page.', Boolean(response?.error));
  }
  if (state?.awControlPlane) controlPlane.value = state.awControlPlane;
  await renderBackendConfiguration();
}

document.getElementById('pair').addEventListener('click', async () => {
  setStatus('Connecting...');
  const response = await message('AW_PAIR', { code: code.value, controlPlane: controlPlane.value });
  if (!response?.ok) return setStatus(response?.error || 'Unable to connect.', true);
  code.value = '';
  await render();
});

document.getElementById('sync').addEventListener('click', async () => {
  setStatus('Syncing...');
  const response = await message('AW_SYNC_NOW');
  if (!response?.ok || response.error) setStatus(response?.error || 'Unable to sync.', true);
  else await render();
});

document.getElementById('disconnect').addEventListener('click', async () => {
  setStatus('Disconnecting...');
  const response = await message('AW_DISCONNECT');
  if (!response?.ok) setStatus(response?.error || 'Unable to disconnect.', true);
  else await render();
});

document.getElementById('save-backend').addEventListener('click', async () => {
  setBackendBusy(true);
  setBackendStatus('Validating and saving the FastAPI URL...');
  try {
    const response = await message('AW_SET_BACKEND_CONFIG', { backendBaseUrl: backendServer.value });
    if (!response?.ok) throw new Error(response?.error || 'Unable to save the FastAPI URL.');
    backendServer.value = response.backendBaseUrl;
    setBackendStatus('FastAPI URL saved. It will be used by the next assistance request.', 'success');
  } catch (error) {
    setBackendStatus(error instanceof Error ? error.message : 'Unable to save the FastAPI URL.', 'error');
  } finally {
    setBackendBusy(false);
  }
});

document.getElementById('test-backend').addEventListener('click', async () => {
  setBackendBusy(true);
  setBackendStatus('Testing the FastAPI health endpoint...');
  try {
    const response = await message('AW_TEST_BACKEND', { backendBaseUrl: backendServer.value, saveOnSuccess: true });
    if (!response?.ok) throw new Error(response?.error || 'Unable to connect to FastAPI.');
    backendServer.value = response.backendBaseUrl;
    setBackendStatus(`Connected and saved successfully ${new Date(response.checkedAt).toLocaleString()}.`, 'success');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unable to connect to FastAPI.';
    setBackendStatus(`${detail} The previously saved FastAPI URL was not changed.`, 'error');
  } finally {
    setBackendBusy(false);
  }
});

document.getElementById('reset-backend').addEventListener('click', async () => {
  setBackendBusy(true);
  try {
    const response = await message('AW_RESET_BACKEND_CONFIG');
    if (!response?.ok) throw new Error(response?.error || 'Unable to restore the local default.');
    backendServer.value = response.backendBaseUrl;
    setBackendStatus('Restored the local FastAPI default. Test it after starting the backend.', 'success');
  } catch (error) {
    setBackendStatus(error instanceof Error ? error.message : 'Unable to restore the local default.', 'error');
  } finally {
    setBackendBusy(false);
  }
});

void render();
