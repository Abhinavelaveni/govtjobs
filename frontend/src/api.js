export const token = () => localStorage.getItem('tok');
export const role = () => {
  try {
    const payload = token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role;
  } catch { return null; }
};
export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token() && { Authorization: 'Bearer ' + token() }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
export const waCfg = () => ({
  url: localStorage.getItem('wa_api_url') || 'https://waapi.hybridnet.in/api/v1/sessions',
  sessionId: localStorage.getItem('wa_session_id') || '050fe2b6-483f-4b89-b3f1-fde2602a22d0',
  tpl: localStorage.getItem('wa_tpl') || 'government_job_alert',
  key: sessionStorage.getItem('wa_key') || ''
});
export const saveWaCfg = config => {
  localStorage.setItem('wa_api_url', config.url.trim().replace(/\/$/, ''));
  localStorage.setItem('wa_session_id', config.sessionId.trim());
  localStorage.setItem('wa_tpl', config.tpl.trim());
  sessionStorage.setItem('wa_key', config.key.trim());
};
export const buildUrl = (config, phone, message) => {
  const endpoint = `${config.url.replace(/\/$/, '')}/${encodeURIComponent(config.sessionId)}/messages/send-text`;
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ apikey: config.key, receiver: `91${phone}`, message, template: config.tpl }).toString();
  return url.toString();
};
export async function testWhatsApp(config, phone) {
  if (!config.key) throw new Error('Enter the API key first');
  if (!/^[6-9]\d{9}$/.test(phone || '')) throw new Error('Enter a valid 10-digit Indian mobile number');
  const response = await fetch(buildUrl(config, phone, 'GovJobs Alerts test message. WhatsApp connection is working.'), { method: 'GET' });
  const detail = await response.text();
  if (!response.ok) throw new Error(detail || `WhatsApp API returned HTTP ${response.status}`);
  return detail || 'Test message accepted by the WhatsApp API.';
}
export async function sendNotification(n) {
  const c = waCfg(); if (!c.key) throw new Error('Set the API key in WhatsApp settings first');
  if (!/^[6-9]\d{9}$/.test(n.whatsapp)) {
    await api(`/notifications/${n.id}/status`, 'PUT', { status: 'Failed', error: 'Invalid mobile number' });
    throw new Error(`Notification ${n.id} has an invalid mobile number`);
  }
  await api(`/notifications/${n.id}/status`, 'PUT', { status: 'Sending' });
  let response;
  let detail;
  try {
    response = await fetch(buildUrl(c, n.whatsapp, n.message));
    detail = await response.text();
  } catch (error) {
    await api(`/notifications/${n.id}/status`, 'PUT', { status: 'Failed', error: error.message });
    throw error;
  }
  let providerError;
  try { providerError = JSON.parse(detail); } catch { providerError = null; }
  const limitHit = providerError?.code === 'per_contact_limit' || /per_contact_limit|messages? to this contact in the last 60 minutes/i.test(detail || '');
  const accepted = response.ok && !providerError?.error;
  const status = accepted ? 'Sent' : limitHit ? 'Queued' : 'Failed';
  const error = accepted ? '' : limitHit ? `Waiting in GovJobs queue for the contact limit to reset${providerError?.retry_after_seconds ? ` (${providerError.retry_after_seconds}s)` : ''}` : `HTTP ${response.status}: ${detail}`;
  await api(`/notifications/${n.id}/status`, 'PUT', { status, response: detail, error });
  if (!accepted) throw new Error(limitHit ? 'Contact rate limit reached; notification remains queued in GovJobs.' : `WhatsApp API returned HTTP ${response.status}`);
}
