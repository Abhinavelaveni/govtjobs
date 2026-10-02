import { collection, nextId } from './db.js';
import { render } from './templates.js';

export function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function whatsappLimitReached(sentCountInLastHour, limit = 4) {
  return Number(sentCountInLastHour || 0) >= limit;
}

const low = a => (a || []).map(s => normalizeForSearch(s));
export function matches(job, p) {
  if (!p.whatsapp_optin || p.opted_out) return false;
  if (p.gov_level !== 'Both' && job.gov_level && !normalizeForSearch(job.gov_level).startsWith(normalizeForSearch(p.gov_level))) return false;
  if (p.categories?.length && !p.categories.some(category => normalizeForSearch(category) === normalizeForSearch(job.category))) return false;
  if (p.education && job.qualification?.length && !low(job.qualification).some(qualification => qualification.includes(normalizeForSearch(p.education)))) return false;
  const locs = low(p.locations), jl = normalizeForSearch(job.location || '');
  if (locs.length && jl && jl !== 'all india' && !locs.some(loc => jl.includes(loc) || loc.includes(jl))) return false;
  const kws = low(p.keywords), t = normalizeForSearch(job.title || '');
  if (kws.length && !kws.some(k => t.includes(k))) return false;
  return true;
}
// Creates Pending notifications; UNIQUE(user_id, job_id) prevents duplicates.
export async function queueForJob(job, sourceName) {
  const users = await collection('user_preferences').find({ whatsapp_optin: true, opted_out: { $ne: true }, whatsapp: { $ne: null } }).toArray();
  const cfg = await collection('whatsapp_config').findOne({ id: 1 });
  const tpl = await collection('whatsapp_templates').findOne({ is_default: true });
  let n = 0;
  for (const preference of users.filter(user => matches(job, user))) {
    try {
      await collection('notifications').insertOne({
        id: await nextId('notifications'), user_id: preference.user_id, job_id: job.id,
        whatsapp: preference.whatsapp, message: render(job, sourceName, tpl?.body),
        template_id: cfg?.template_id ?? null, status: 'Queued', retry_count: 0,
        retryable: true, next_attempt_at: new Date(), created_at: new Date()
      });
      n++;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  return n;
}
