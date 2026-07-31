export class ApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, details || {});
  }
}

let csrfToken = '';
let mutationActive = false;
let hooks = { onMutationStart() {}, onMutationEnd() {}, onConnectionChange() {} };

const sessionReady = fetch('/api/session').then(async response => {
  if (!response.ok) throw new ApiError('Could not start a secure editor session.', { status: response.status });
  const value = await response.json();
  csrfToken = value.csrfToken || '';
});

export function operationLabel(path) {
  if (/currencies/.test(path)) return 'Updating resources';
  if (/inventory/.test(path)) return 'Saving inventory';
  if (/weapon-xp/.test(path)) return 'Saving weapon XP';
  if (/characters/.test(path)) return 'Saving character progress';
  if (/hub-upgrades/.test(path)) return 'Saving Innards upgrades';
  if (/vendors/.test(path)) return 'Saving vendor progress';
  if (/backups/.test(path)) return 'Updating backups';
  if (/repair/.test(path)) return 'Updating repair bench';
  if (/quests/.test(path)) return 'Updating quest';
  if (/rigs/.test(path)) return 'Saving rig inventory';
  return 'Saving and verifying';
}

export async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (isMutation && mutationActive) throw new ApiError('Please wait for the current save operation to finish.', { status: 409, code: 'mutation-active' });
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (isMutation) {
    await sessionReady;
    headers['X-CSRF-Token'] = csrfToken;
    mutationActive = true;
    hooks.onMutationStart({ path, method, label: operationLabel(path) });
  }
  try {
    let response;
    try {
      response = await fetch(`/api${path}`, { ...options, method, headers });
    } catch (cause) {
      hooks.onConnectionChange(false);
      throw new ApiError(isMutation ? 'Connection lost while saving. Whether it saved is unknown -- reload the page to check before trying again.' : 'The local editor server is unavailable. Reload the page and try again.', { code: 'connection', uncertainMutation: isMutation, cause });
    }
    hooks.onConnectionChange(true);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new ApiError((data && data.error) || `Request failed (${response.status}).`, { status: response.status, payload: data, code: response.status === 409 ? 'conflict' : 'api' });
    return data;
  } finally {
    if (isMutation) {
      mutationActive = false;
      hooks.onMutationEnd();
    }
  }
}

export function configure(nextHooks) {
  hooks = { ...hooks, ...(nextHooks || {}) };
}

export function isMutationActive() {
  return mutationActive;
}

