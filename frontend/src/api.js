export const token = () => localStorage.getItem('tok');
export const role = () => {
  try {
    const payload = token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role;
  } catch { return null; }
};
export async function api(path, method = 'GET', body) {
  const retryDelays = [250, 500, 1000, 1500, 2000, 2000];
  const retryable = method.toUpperCase() === 'GET';
  const options = { method, headers: { 'Content-Type': 'application/json', ...(token() && { Authorization: 'Bearer ' + token() }) }, body: body === undefined ? undefined : JSON.stringify(body) };
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch('/api' + path, options);
    } catch (error) {
      if (!retryable || attempt >= retryDelays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (retryable && response.status >= 500 && attempt < retryDelays.length) {
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      continue;
    }
    throw new Error(data.error || response.statusText);
  }
}
export const waCfg = () => ({
  url: localStorage.getItem('wa_api_url') || 'https://waapi.hybridnet.in/api/v1/sessions',
  sessionId: localStorage.getItem('wa_session_id') || '050fe2b6-483f-4b89-b3f1-fde2602a22d0',
  tpl: localStorage.getItem('wa_tpl') || 'government_job_alert',
  key: sessionStorage.getItem('wa_key') || ''
});
export const saveWaCfg = async config => {
  const result = await api('/admin/whatsapp/config', 'PUT', config);
  for (const key of ['wa_api_url', 'wa_session_id', 'wa_tpl']) localStorage.removeItem(key);
  sessionStorage.removeItem('wa_key');
  return result;
};
export const buildUrl = (config, phone, message) => {
  const endpoint = `${config.url.replace(/\/$/, '')}/${encodeURIComponent(config.sessionId)}/messages/send-text`;
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ apikey: config.key, receiver: `91${phone}`, message, template: config.tpl }).toString();
  return url.toString();
};
export async function testWhatsApp(phone) {
  if (!/^[6-9]\d{9}$/.test(phone || '')) throw new Error('Enter a valid 10-digit Indian mobile number');
  const result = await api('/admin/whatsapp/test', 'POST', { phone });
  return result.response || 'Test message accepted by the WhatsApp API.';
}
export async function sendNotification(n) {
  if (!/^[6-9]\d{9}$/.test(n.whatsapp)) {
    await api(`/notifications/${n.id}/status`, 'PUT', { status: 'Failed', error: 'Invalid mobile number' });
    throw new Error(`Notification ${n.id} has an invalid mobile number`);
  }
  await api(`/admin/notifications/${n.id}/send`, 'POST');
}
