import express from 'express';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import { closeDB, collection, connectDB, nextId } from './db.js';
import { runSource, runAll, fingerprint } from './scraper.js';
import { normalizeForSearch, queueForJob } from './matcher.js';
import { nextWhatsAppAttemptAt, reserveWhatsAppSlot, retryDelayMs } from './whatsapp-queue.js';
import { isSupportedScrapeInterval, normalizeScrapeInterval, scrapeCronExpression } from './scheduler.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required');

const app = express();
const frontendDist = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const frontendIndex = fileURLToPath(new URL('../frontend/dist/index.html', import.meta.url));
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()) || true }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, max: 30 }));
app.use(express.static(frontendDist));

const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(error => {
  console.error(error);
  res.status(500).json({ error: 'Server error' });
});
const tokenAuth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Forbidden' });
const auth = [tokenAuth];
const admins = [tokenAuth, admin];
const phone = value => /^[6-9]\d{9}$/.test(String(value || ''));
const arr = value => Array.isArray(value) ? value.map(item => String(item).trim().slice(0, 100)).filter(Boolean).slice(0, 50) : [];
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const safeUrl = value => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
const whatsappDefaults = {
  url: 'https://waapi.hybridnet.in/api/v1/sessions',
  sessionId: '050fe2b6-483f-4b89-b3f1-fde2602a22d0',
  tpl: 'government_job_alert'
};
const publicWhatsAppConfig = config => ({
  url: config?.url || whatsappDefaults.url,
  sessionId: config?.sessionId || whatsappDefaults.sessionId,
  tpl: config?.tpl || config?.template_id || whatsappDefaults.tpl,
  keyConfigured: Boolean(config?.key)
});
async function requestWhatsApp(config, phoneNumber, message) {
  const whatsappConfig = await collection('whatsapp_config').findOne({ id: 1 }, { projection: { paused: 1 } });
  if (whatsappConfig?.paused) throw Object.assign(new Error('WhatsApp is on hold by an administrator'), { status: 423 });
  if (!config.key || !config.sessionId) throw Object.assign(new Error('WhatsApp API key and session ID are required'), { status: 400 });
  const providerUrl = new URL(config.url || 'https://waapi.hybridnet.in/api/v1/sessions');
  if (providerUrl.protocol !== 'https:' || providerUrl.hostname !== 'waapi.hybridnet.in' || providerUrl.port) {
    throw Object.assign(new Error('WhatsApp API URL must use https://waapi.hybridnet.in'), { status: 400 });
  }
  const suffix = '/messages/send-text';
  providerUrl.pathname = providerUrl.pathname.replace(/\/+$/, '');
  if (providerUrl.pathname.endsWith(suffix)) {
    const configuredSession = providerUrl.pathname.slice(0, -suffix.length).split('/').at(-1);
    if (configuredSession !== config.sessionId) throw Object.assign(new Error('WhatsApp endpoint session ID does not match the configured session'), { status: 400 });
  } else {
    providerUrl.pathname += `/${encodeURIComponent(config.sessionId)}${suffix}`;
  }
  providerUrl.search = new URLSearchParams({ apikey: config.key, receiver: `91${phoneNumber}`, message, template: config.tpl || '' }).toString();
  const response = await fetch(providerUrl, { signal: AbortSignal.timeout(20000) });
  const detail = await response.text();
  let providerResult;
  try { providerResult = JSON.parse(detail); } catch { providerResult = null; }
  const limitHit = providerResult?.code === 'per_contact_limit' || /per_contact_limit|messages? to this contact in the last 60 minutes/i.test(detail);
  const accepted = response.ok && !providerResult?.error;
  return {
    accepted,
    limitHit,
    retryAfterSeconds: Number(providerResult?.retry_after_seconds) || 0,
    response: detail.slice(0, 2000),
    error: accepted ? '' : limitHit ? `Waiting in GovJobs queue for the contact limit to reset${providerResult?.retry_after_seconds ? ` (${providerResult.retry_after_seconds}s)` : ''}` : `HTTP ${response.status}: ${detail}`
  };
}

let whatsappQueueRunning = false;
function wakeWhatsAppQueue() {
  setImmediate(() => void processWhatsAppQueue());
}

async function processWhatsAppQueue() {
  if (whatsappQueueRunning) return;
  whatsappQueueRunning = true;
  try {
    const now = new Date();
    const config = await collection('whatsapp_config').findOne({ id: 1 });
    await collection('notifications').updateMany(
      { status: 'Sending', $or: [{ sending_at: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } }, { sending_at: { $exists: false } }] },
      { $set: { status: 'Queued', retryable: true, next_attempt_at: now, error: 'Recovered an interrupted send; it will be retried.' }, $unset: { sending_at: '' } }
    );
    if (config?.paused || !config?.key || !config?.sessionId) return;

    const due = await collection('notifications').find({
      $and: [
        { $or: [{ status: { $in: ['Queued', 'Pending', 'Retrying'] } }, { status: 'Failed', retryable: { $ne: false } }] },
        { $or: [{ next_attempt_at: { $exists: false } }, { next_attempt_at: null }, { next_attempt_at: { $lte: now } }] }
      ]
    }).sort({ created_at: 1, id: 1 }).limit(100).toArray();

    for (const notification of due) {
      const currentConfig = await collection('whatsapp_config').findOne({ id: 1 }, { projection: { paused: 1 } });
      if (currentConfig?.paused) break;
      const claimed = await collection('notifications').updateOne(
        { id: notification.id, status: notification.status },
        { $set: { status: 'Sending', sending_at: new Date(), error: '' } }
      );
      if (!claimed.modifiedCount) continue;

      const preference = await collection('user_preferences').findOne({
        user_id: notification.user_id, whatsapp: notification.whatsapp,
        whatsapp_optin: true, opted_out: { $ne: true }
      });
      if (!preference || !phone(notification.whatsapp)) {
        const error = preference ? 'Invalid WhatsApp number' : 'User consent is disabled or the WhatsApp number has changed';
        await collection('notifications').updateOne({ id: notification.id }, {
          $set: { status: 'Failed', retryable: false, next_attempt_at: null, error },
          $unset: { sending_at: '' }
        });
        await collection('notification_logs').insertOne({ id: await nextId('notification_logs'), notification_id: notification.id, status: 'Failed', detail: error, at: new Date() });
        continue;
      }

      const slot = await reserveWhatsAppSlot(collection('whatsapp_rate_limits'), notification.whatsapp, new Date());
      if (!slot.reserved) {
        await collection('notifications').updateOne({ id: notification.id }, {
          $set: { status: 'Queued', retryable: true, next_attempt_at: slot.nextAt, error: 'Contact rate limit reached; waiting for the hourly limit to reset' },
          $unset: { sending_at: '' }
        });
        continue;
      }

      let result;
      try { result = await requestWhatsApp(config, notification.whatsapp, notification.message); }
      catch (error) { result = { accepted: false, limitHit: false, statusCode: error.status, response: '', error: error.message }; }
      const sentAt = new Date();
      const retryCount = Number(notification.retry_count || 0) + 1;
      const status = result.accepted ? 'Sent' : result.limitHit || result.statusCode === 423 ? 'Queued' : 'Failed';
      const nextAttemptAt = result.accepted ? null : result.limitHit
        ? new Date(sentAt.getTime() + Math.max(60, result.retryAfterSeconds || 3600) * 1000)
        : result.statusCode === 423 ? new Date(sentAt.getTime() + 30_000) : new Date(sentAt.getTime() + retryDelayMs(retryCount));
      await collection('notifications').updateOne({ id: notification.id }, {
        $set: {
          status, retry_count: result.accepted ? Number(notification.retry_count || 0) : retryCount,
          retryable: !result.accepted, next_attempt_at: nextAttemptAt,
          api_response: result.response, error: result.error,
          ...(result.accepted ? { sent_at: sentAt } : {})
        },
        $unset: { sending_at: '' }
      });
      await collection('notification_logs').insertOne({ id: await nextId('notification_logs'), notification_id: notification.id, status, detail: result.error || result.response, at: sentAt });
    }
  } catch (error) {
    console.error('WhatsApp queue processing failed', error);
  } finally {
    whatsappQueueRunning = false;
  }
}
const jobFields = ['title', 'organization', 'department', 'recruitment_no', 'notification_no', 'category', 'gov_level', 'vacancies', 'qualification', 'age_limit', 'salary', 'experience', 'location', 'start_date', 'last_date', 'fee', 'selection_process', 'exam_date', 'published_at', 'notification_url', 'application_url', 'source_id', 'source_url', 'verified', 'featured'];
const dateValue = value => value ? String(value).slice(0, 10) : null;

const publicDoc = document => {
  if (!document) return document;
  const { _id, ...data } = document;
  return data;
};

async function withSource(job) {
  if (!job) return null;
  const source = job.source_id ? await collection('job_sources').findOne({ id: job.source_id }) : null;
  return { ...publicDoc(job), source_name: source?.name ?? null, source_tier: source?.config?.sourceTier ?? null, source_authority: source?.config?.sourceAuthority ?? null };
}

function matchesTextFilters(job, query) {
  const searchTerm = normalizeForSearch(query.search);
  if (searchTerm) {
    const haystack = normalizeForSearch([job.title, job.organization, job.department].filter(Boolean).join(' '));
    if (!haystack.includes(searchTerm)) return false;
  }
  if (query.category) {
    const category = normalizeForSearch(query.category);
    if (normalizeForSearch(job.category) !== category) return false;
  }
  if (query.level) {
    const level = normalizeForSearch(query.level);
    if (!normalizeForSearch(job.gov_level || '').startsWith(level)) return false;
  }
  if (query.state) {
    const state = normalizeForSearch(query.state);
    const location = normalizeForSearch(job.location || '');
    if (location && location !== 'all india' && !location.includes(state)) return false;
  }
  if (query.organization) {
    const organization = normalizeForSearch(query.organization);
    if (!normalizeForSearch(job.organization || '').includes(organization)) return false;
  }
  if (query.qualification) {
    const qualification = normalizeForSearch(query.qualification);
    const values = Array.isArray(job.qualification) ? job.qualification : [job.qualification];
    if (!values.some(value => normalizeForSearch(value).includes(qualification))) return false;
  }
  if (query.salary) {
    const salary = normalizeForSearch(query.salary);
    if (!normalizeForSearch(job.salary || '').includes(salary)) return false;
  }
  return true;
}

async function listJobs(query, options) {
  const criteria = {};
  const deadline = {};
  if (query.deadlineFrom) deadline.$gte = dateValue(query.deadlineFrom);
  if (query.deadlineTo) deadline.$lte = dateValue(query.deadlineTo);
  if (Object.keys(deadline).length) criteria.last_date = deadline;
  const published = {};
  if (query.publishedFrom) published.$gte = dateValue(query.publishedFrom);
  if (query.publishedTo) published.$lte = dateValue(query.publishedTo);
  if (Object.keys(published).length) criteria.published_at = published;
  if (query.sourceId && options?.adminMode) criteria.source_id = positiveId(query.sourceId) || 0;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(query.pageSize, 10) || 20));
  const documents = await collection('jobs').find(criteria).sort({ featured: -1, created_at: -1 }).toArray();
  const filtered = (await Promise.all(documents.map(withSource))).filter(job => matchesTextFilters(job, query));
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total, page, pageSize };
}

async function writeJob(body, id = null) {
  const input = { ...body };
  if (!input.title?.trim() || !input.organization?.trim()) throw Object.assign(new Error('Title and organization are required'), { status: 400 });
  if (!safeUrl(input.notification_url) || !safeUrl(input.source_url)) throw Object.assign(new Error('Valid official notification and source URLs are required'), { status: 400 });
  if (input.application_url && !safeUrl(input.application_url)) throw Object.assign(new Error('Application URL must be a valid HTTP(S) URL'), { status: 400 });
  const data = {};
  for (const field of jobFields) if (Object.hasOwn(input, field)) data[field] = input[field];
  data.title = String(input.title).trim().slice(0, 1000);
  data.organization = String(input.organization).trim().slice(0, 500);
  data.notification_url = input.notification_url;
  data.source_url = input.source_url;
  data.qualification = arr(input.qualification);
  for (const field of ['start_date', 'last_date', 'exam_date', 'published_at']) data[field] = dateValue(input[field]);
  for (const field of ['department', 'recruitment_no', 'notification_no', 'category', 'gov_level', 'age_limit', 'salary', 'experience', 'location', 'fee', 'selection_process', 'application_url']) data[field] = input[field] || null;
  data.vacancies = Number(input.vacancies) > 0 ? Number(input.vacancies) : null;
  data.source_id = positiveId(input.source_id);
  data.verified = Boolean(input.verified);
  data.featured = Boolean(input.featured);
  data.updated_at = new Date();

  if (id) {
    await collection('jobs').updateOne({ id }, { $set: data });
  } else {
    data.fingerprint = fingerprint(data);
    id = await nextId('jobs');
    data.id = id;
    data.created_at = data.updated_at;
    await collection('jobs').insertOne(data);
  }
  const job = publicDoc(await collection('jobs').findOne({ id }));
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (!body.id) {
    await queueForJob(job, job.organization);
    wakeWhatsAppQueue();
  }
  return job;
}

app.post('/api/auth/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim() || String(req.body.whatsapp || '').trim() || 'GovJobs User';
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const whatsapp = String(req.body.whatsapp || '').replace(/\D/g, '').slice(-10);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !phone(whatsapp)) return res.status(400).json({ error: 'Valid email, 8+ character password and a 10-digit WhatsApp number are required' });
  const user = { id: await nextId('users'), name: name.slice(0, 255), email, password_hash: await bcrypt.hash(password, 12), role: 'user', created_at: new Date() };
  try { await collection('users').insertOne(user); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw error;
  }
  await collection('user_preferences').insertOne({ user_id: user.id, whatsapp, whatsapp_optin: true, categories: [], departments: [], locations: [], keywords: [], gov_level: 'Both', opted_out: false });
  res.json({ token: jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const user = await collection('users').findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }) });
}));
app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const user = await collection('users').findOne({ id: req.user.id }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, created_at: 1 } });
  user ? res.json(user) : res.status(404).json({ error: 'User not found' });
}));
app.put('/api/users/account', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 255);
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email address are required' });
  if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const changes = { name, email };
  if (password) changes.password_hash = await bcrypt.hash(password, 12);
  try {
    await collection('users').updateOne({ id: req.user.id }, { $set: changes });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw error;
  }
  res.json({ ok: true });
}));

app.get('/api/jobs', wrap(async (req, res) => res.json(await listJobs(req.query))));
app.get('/api/jobs/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id);
  const job = await withSource(await collection('jobs').findOne({ id: id || 0 }));
  job ? res.json(job) : res.status(404).json({ error: 'Job not found' });
}));
app.get('/api/categories', wrap(async (_, res) => res.json((await collection('job_categories').find().sort({ name: 1 }).toArray()).map(publicDoc))));
app.get('/api/sources', wrap(async (_, res) => res.json(await collection('job_sources').find({ enabled: true }, { projection: { _id: 0, id: 1, name: 1, url: 1 } }).sort({ name: 1 }).toArray())));

app.get('/api/users/preferences', auth, wrap(async (req, res) => {
  res.json(publicDoc(await collection('user_preferences').findOne({ user_id: req.user.id })) || {});
}));
app.put('/api/users/preferences', auth, wrap(async (req, res) => {
  const body = req.body;
  if (body.whatsapp_optin && !phone(body.whatsapp)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number before enabling alerts' });
  const experience = Math.max(0, Math.min(60, Number(body.experience) || 0));
  const age = body.age ? Math.max(18, Math.min(100, Number(body.age))) : null;
  const whatsappOptin = Boolean(body.whatsapp_optin);
  await collection('user_preferences').updateOne({ user_id: req.user.id }, { $set: {
    whatsapp: body.whatsapp || null, state: body.state || null, district: body.district || null, education: body.education || null,
    experience, age, categories: arr(body.categories), departments: arr(body.departments), locations: arr(body.locations), keywords: arr(body.keywords),
    min_salary: Math.max(0, Number(body.min_salary) || 0), gov_level: ['Central', 'State', 'Both'].includes(body.gov_level) ? body.gov_level : 'Both',
    whatsapp_optin: whatsappOptin, ...(whatsappOptin ? { opted_out: false } : {})
  } }, { upsert: true });
  res.json({ ok: true });
}));
app.get('/api/users/dashboard', auth, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [savedCount, notificationCount, preference, saved, upcoming, latest] = await Promise.all([
    collection('saved_jobs').countDocuments({ user_id: req.user.id }), collection('notifications').countDocuments({ user_id: req.user.id }),
    collection('user_preferences').findOne({ user_id: req.user.id }),
    collection('saved_jobs').find({ user_id: req.user.id }, { projection: { _id: 0, job_id: 1 } }).sort({ job_id: -1 }).limit(8).toArray(),
    collection('jobs').find({ last_date: { $gte: today } }, { projection: { _id: 0, id: 1, title: 1, organization: 1, last_date: 1 } }).sort({ last_date: 1 }).limit(5).toArray(),
    collection('jobs').find({}, { projection: { _id: 0, id: 1, title: 1, organization: 1, category: 1, gov_level: 1, location: 1, last_date: 1, featured: 1, verified: 1 } }).sort({ created_at: -1 }).limit(5).toArray()
  ]);
  res.json({ saved: savedCount, notifications: notificationCount, alerts_enabled: Number(Boolean(preference?.whatsapp_optin && !preference?.opted_out)), saved_job_ids: saved.map(row => row.job_id), upcoming, latest });
}));
app.get('/api/saved-jobs', auth, wrap(async (req, res) => {
  const saved = await collection('saved_jobs').find({ user_id: req.user.id }).sort({ job_id: -1 }).toArray();
  const jobs = await Promise.all(saved.map(async row => withSource(await collection('jobs').findOne({ id: row.job_id }))));
  res.json(jobs.filter(Boolean));
}));
app.post('/api/jobs/:id/save', auth, wrap(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });
  if (await collection('jobs').findOne({ id }, { projection: { _id: 1 } })) await collection('saved_jobs').updateOne({ user_id: req.user.id, job_id: id }, { $setOnInsert: { user_id: req.user.id, job_id: id, created_at: new Date() } }, { upsert: true });
  res.json({ ok: true });
}));
app.delete('/api/jobs/:id/save', auth, wrap(async (req, res) => {
  await collection('saved_jobs').deleteOne({ user_id: req.user.id, job_id: positiveId(req.params.id) || 0 });
  res.json({ ok: true });
}));

app.get('/api/notifications', auth, wrap(async (req, res) => {
  const notifications = await collection('notifications').find({ user_id: req.user.id }).sort({ id: -1 }).limit(200).toArray();
  res.json((await Promise.all(notifications.map(async notification => {
    const job = await collection('jobs').findOne({ id: notification.job_id }, { projection: { title: 1, organization: 1 } });
    return { ...publicDoc(notification), title: job?.title, organization: job?.organization };
  }))).filter(item => item.title));
}));
app.put('/api/notifications/preferences', auth, wrap(async (req, res) => {
  await collection('user_preferences').updateOne({ user_id: req.user.id, opted_out: { $ne: true } }, { $set: { whatsapp_optin: Boolean(req.body.enabled) } });
  res.json({ ok: true });
}));
app.put('/api/notifications/:id/status', auth, wrap(async (req, res) => {
  const status = req.body.status;
  if (!['Queued', 'Sending', 'Sent', 'Failed', 'Retrying'].includes(status)) return res.status(400).json({ error: 'Invalid notification status' });
  const id = positiveId(req.params.id);
  const notification = await collection('notifications').findOne({ id: id || 0, ...(req.user.role === 'admin' ? {} : { user_id: req.user.id }) });
  if (!notification) return res.status(404).json({ error: 'Notification not found' });
  await collection('notifications').updateOne({ id }, { $set: {
    status, api_response: String(req.body.response || '').slice(0, 2000), error: String(req.body.error || '').slice(0, 500),
    ...(status === 'Sent' ? { sent_at: new Date() } : {}),
    ...(status === 'Failed' ? { retryable: false, next_attempt_at: null } : {})
  } });
  await collection('notification_logs').insertOne({ id: await nextId('notification_logs'), notification_id: id, status, detail: String(req.body.error || req.body.response || '').slice(0, 2000), at: new Date() });
  res.json({ ok: true });
}));
app.post('/api/webhooks/whatsapp-inbound', wrap(async (req, res) => {
  const number = String(req.body.from || '').replace(/\D/g, '').slice(-10);
  if (String(req.body.text || '').trim().toUpperCase() === 'STOP' && phone(number)) await collection('user_preferences').updateMany({ whatsapp: number }, { $set: { opted_out: true, whatsapp_optin: false } });
  res.json({ ok: true });
}));

app.get('/api/admin/dashboard', admins, wrap(async (_, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [total_jobs, jobs_today, users, subscribers, sent, failed, pending, active_scrapers] = await Promise.all([
    collection('jobs').countDocuments(), collection('jobs').countDocuments({ created_at: { $gte: today } }), collection('users').countDocuments(),
    collection('user_preferences').countDocuments({ whatsapp_optin: true, opted_out: { $ne: true } }), collection('notifications').countDocuments({ status: 'Sent' }),
    collection('notifications').countDocuments({ status: 'Failed', retryable: { $ne: true } }),
    collection('notifications').countDocuments({ $or: [{ status: { $in: ['Queued', 'Pending', 'Retrying'] } }, { status: 'Failed', retryable: true }] }),
    collection('job_sources').countDocuments({ enabled: true })
  ]);
  res.json({ total_jobs, jobs_today, users, subscribers, sent, failed, pending, active_scrapers });
}));
app.get('/api/admin/jobs', admins, wrap(async (req, res) => res.json(await listJobs(req.query, { adminMode: true }))));
app.post('/api/admin/jobs', admins, wrap(async (req, res) => res.status(201).json(await writeJob(req.body))));
app.put('/api/admin/jobs/:id', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });
  res.json(await writeJob(req.body, id));
}));
app.put('/api/admin/jobs/:id/verify', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  await collection('jobs').updateOne({ id }, { $set: { verified: Boolean(req.body.verified), updated_at: new Date() } });
  res.json({ ok: true });
}));
app.put('/api/admin/jobs/:id/feature', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  await collection('jobs').updateOne({ id }, { $set: { featured: Boolean(req.body.featured), updated_at: new Date() } });
  res.json({ ok: true });
}));
app.delete('/api/admin/jobs/:id', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  await Promise.all([collection('jobs').deleteOne({ id }), collection('saved_jobs').deleteMany({ job_id: id }), collection('notifications').deleteMany({ job_id: id })]);
  res.json({ ok: true });
}));

app.get('/api/admin/categories', admins, wrap(async (_, res) => res.json((await collection('job_categories').find().sort({ name: 1 }).toArray()).map(publicDoc))));
app.post('/api/admin/categories', admins, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const category = { id: await nextId('job_categories'), name };
  await collection('job_categories').insertOne(category);
  res.status(201).json(category);
}));
app.put('/api/admin/categories/:id', admins, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const id = positiveId(req.params.id) || 0;
  const previous = await collection('job_categories').findOne({ id });
  if (!previous) return res.status(404).json({ error: 'Category not found' });
  await collection('job_categories').updateOne({ id }, { $set: { name } });
  await collection('jobs').updateMany({ category: previous.name }, { $set: { category: name } });
  res.json({ ok: true });
}));
app.delete('/api/admin/categories/:id', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  const category = await collection('job_categories').findOne({ id });
  if (!category) return res.status(404).json({ error: 'Category not found' });
  await collection('job_categories').deleteOne({ id });
  await collection('jobs').updateMany({ category: category.name }, { $set: { category: 'Other' } });
  res.json({ ok: true });
}));

app.get('/api/admin/users', admins, wrap(async (req, res) => {
  const search = String(req.query.search || '').slice(0, 120);
  const users = await collection('users').find().sort({ id: -1 }).limit(300).toArray();
  const result = await Promise.all(users.map(async user => {
    const preferences = await collection('user_preferences').findOne({ user_id: user.id });
    return { ...publicDoc(user), ...publicDoc(preferences || {}) };
  }));
  res.json(result.filter(user => !search || [user.name, user.email, user.whatsapp].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()))));
}));
app.post('/api/admin/users', admins, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const whatsapp = String(req.body.whatsapp || '').replace(/\D/g, '').slice(-10);
  const role = ['user', 'admin'].includes(req.body.role) ? req.body.role : 'user';
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !phone(whatsapp)) return res.status(400).json({ error: 'Name, valid email, 8+ character password, and 10-digit WhatsApp number are required' });
  const user = { id: await nextId('users'), name: name.slice(0, 255), email, password_hash: await bcrypt.hash(password, 12), role, created_at: new Date() };
  try { await collection('users').insertOne(user); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    throw error;
  }
  await collection('user_preferences').insertOne({ user_id: user.id, whatsapp, whatsapp_optin: true, categories: [], departments: [], locations: [], keywords: [], gov_level: 'Both', opted_out: false });
  delete user.password_hash;
  res.status(201).json(user);
}));
app.put('/api/admin/users/:id/alerts', admins, wrap(async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  await collection('user_preferences').updateOne({ user_id: positiveId(req.params.id) || 0 }, { $set: { whatsapp_optin: enabled, ...(enabled ? { opted_out: false } : {}) } });
  res.json({ ok: true });
}));

app.get('/api/admin/sources', admins, wrap(async (_, res) => res.json((await collection('job_sources').find().sort({ id: 1 }).toArray()).map(publicDoc))));
app.post('/api/admin/sources', admins, wrap(async (req, res) => {
  const { name, url } = req.body;
  if (!String(name || '').trim() || !safeUrl(url)) return res.status(400).json({ error: 'Source name and valid URL are required' });
  const source = { id: await nextId('job_sources'), name: String(name).trim().slice(0, 255), url, adapter: req.body.adapter || 'generic', config: req.body.config || {}, enabled: Boolean(req.body.enabled), status: 'idle' };
  await collection('job_sources').insertOne(source);
  res.status(201).json(source);
}));
app.put('/api/admin/sources/:id', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  if (req.body.url && !safeUrl(req.body.url)) return res.status(400).json({ error: 'Source URL must be HTTP(S)' });
  const changes = Object.fromEntries(['name', 'url', 'adapter', 'enabled', 'config'].filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  if (Object.keys(changes).length) await collection('job_sources').updateOne({ id }, { $set: changes });
  res.json({ ok: true });
}));
app.delete('/api/admin/sources/:id', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  if (!id) return res.status(400).json({ error: 'Invalid source id' });
  await collection('job_sources').deleteOne({ id });
  await collection('jobs').updateMany({ source_id: id }, { $set: { source_id: null } });
  res.json({ ok: true });
}));
app.delete('/api/admin/sources/:id/duplicates', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  if (!id) return res.status(400).json({ error: 'Invalid source id' });
  const rows = await collection('jobs').find({ source_id: id }, { projection: { id: 1, fingerprint: 1 } }).sort({ id: 1 }).toArray();
  const keep = new Set();
  const duplicateIds = [];
  for (const row of rows) {
    if (keep.has(row.fingerprint)) duplicateIds.push(row.id);
    else keep.add(row.fingerprint);
  }
  if (!duplicateIds.length) return res.json({ deleted: 0 });
  await collection('jobs').deleteMany({ id: { $in: duplicateIds } });
  res.json({ deleted: duplicateIds.length });
}));
app.get('/api/admin/scrapers', admins, wrap(async (_, res) => {
  const sources = await collection('job_sources').find().sort({ name: 1 }).toArray();
  res.json(await Promise.all(sources.map(async source => {
    const latest = await collection('scraper_runs').find({ source_id: source.id }).sort({ id: -1 }).limit(1).next();
    return { id: source.id, name: source.name, url: source.url, enabled: source.enabled, status: source.status, last_run: source.last_run,
      started_at: latest?.started_at, finished_at: latest?.finished_at, found: latest?.found, new_jobs: latest?.new_jobs,
      duplicates: latest?.duplicates, errors: latest?.errors, log: latest?.log };
  })));
}));
app.post('/api/admin/sources/:id/scrape', admins, wrap(async (req, res) => {
  const result = await runSource(positiveId(req.params.id) || 0);
  wakeWhatsAppQueue();
  res.json(result);
}));

app.get('/api/admin/notifications', admins, wrap(async (req, res) => {
  const status = req.query.status;
  const search = String(req.query.search || '').slice(0, 120).toLowerCase();
  const notifications = await collection('notifications').find(status ? { status } : {}).sort({ id: -1 }).limit(300).toArray();
  const rows = await Promise.all(notifications.map(async notification => {
    const [job, user] = await Promise.all([
      collection('jobs').findOne({ id: notification.job_id }, { projection: { title: 1, organization: 1 } }),
      collection('users').findOne({ id: notification.user_id }, { projection: { name: 1 } })
    ]);
    return job && user ? { ...publicDoc(notification), title: job.title, organization: job.organization, name: user.name } : null;
  }));
  res.json(rows.filter(row => row && (!search || [row.name, row.title, row.whatsapp].some(value => String(value || '').toLowerCase().includes(search)))));
}));
app.post('/api/admin/notifications/:id/retry', admins, wrap(async (req, res) => {
  const result = await collection('notifications').updateOne(
    { id: positiveId(req.params.id) || 0, status: 'Failed' },
    { $set: { status: 'Queued', retryable: true, next_attempt_at: new Date(), error: '' } }
  );
  if (!result.modifiedCount) return res.status(409).json({ error: 'Notification is not failed or is already being processed' });
  wakeWhatsAppQueue();
  res.json({ ok: true });
}));
app.post('/api/admin/notifications/:id/send', admins, wrap(async (req, res) => {
  const id = positiveId(req.params.id) || 0;
  const queued = await collection('notifications').updateOne(
    { id, status: { $in: ['Queued', 'Pending', 'Retrying', 'Failed'] } },
    { $set: { status: 'Queued', retryable: true, next_attempt_at: new Date(), error: '' } }
  );
  if (!queued.modifiedCount) return res.status(409).json({ error: 'Notification is no longer queued' });
  wakeWhatsAppQueue();
  res.status(202).json({ status: 'Queued' });
}));
app.get('/api/admin/whatsapp/state', admins, wrap(async (_, res) => {
  const config = await collection('whatsapp_config').findOne({ id: 1 }, { projection: { paused: 1 } });
  res.json({ paused: Boolean(config?.paused) });
}));
app.put('/api/admin/whatsapp/state', admins, wrap(async (req, res) => {
  const paused = Boolean(req.body.paused);
  await collection('whatsapp_config').updateOne({ id: 1 }, { $set: { paused, updated_at: new Date() } }, { upsert: true });
  if (!paused) wakeWhatsAppQueue();
  res.json({ paused });
}));
app.get('/api/admin/whatsapp/config', admins, wrap(async (_, res) => {
  const config = await collection('whatsapp_config').findOne({ id: 1 });
  res.json(publicWhatsAppConfig(config));
}));
app.put('/api/admin/whatsapp/config', admins, wrap(async (req, res) => {
  const url = String(req.body.url || '').trim().replace(/\/$/, '');
  const sessionId = String(req.body.sessionId || '').trim();
  const tpl = String(req.body.tpl || '').trim();
  const key = String(req.body.key || '').trim();
  const existing = await collection('whatsapp_config').findOne({ id: 1 });
  if (!url || !sessionId || !tpl) return res.status(400).json({ error: 'API URL, session ID, and template ID are required' });
  let providerUrl;
  try { providerUrl = new URL(url); } catch { return res.status(400).json({ error: 'Enter a valid WhatsApp API URL' }); }
  if (providerUrl.protocol !== 'https:' || providerUrl.hostname !== 'waapi.hybridnet.in' || providerUrl.port) {
    return res.status(400).json({ error: 'WhatsApp API URL must use https://waapi.hybridnet.in' });
  }
  if (!key && !existing?.key) return res.status(400).json({ error: 'Enter the WhatsApp API key' });
  const changes = { url, sessionId, tpl, template_id: tpl, updated_at: new Date() };
  if (key) changes.key = key;
  await collection('whatsapp_config').updateOne({ id: 1 }, { $set: changes }, { upsert: true });
  wakeWhatsAppQueue();
  res.json(publicWhatsAppConfig({ ...existing, ...changes, key: key || existing?.key }));
}));
app.post('/api/admin/whatsapp/test', admins, wrap(async (req, res) => {
  const phoneNumber = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  if (!phone(phoneNumber)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number' });
  const config = await collection('whatsapp_config').findOne({ id: 1 });
  if (!config?.key || !config?.sessionId) return res.status(400).json({ error: 'WhatsApp API key and session ID are required' });
  const slot = await reserveWhatsAppSlot(collection('whatsapp_rate_limits'), phoneNumber, new Date());
  if (!slot.reserved) return res.status(429).json({ error: `Contact rate limit reached; next send is available at ${slot.nextAt.toISOString()}` });
  let result;
  try { result = await requestWhatsApp(config || {}, phoneNumber, 'GovJobs Alerts test message. WhatsApp connection is working.'); }
  catch (error) { return res.status(error.status || 502).json({ error: error.message }); }
  if (!result.accepted) return res.status(result.limitHit ? 429 : 502).json({ error: result.error || 'WhatsApp test failed' });
  res.json({ response: result.response || 'Test message accepted by the WhatsApp API.' });
}));

app.get('/api/admin/templates', admins, wrap(async (_, res) => res.json((await collection('whatsapp_templates').find().sort({ is_default: -1, id: -1 }).toArray()).map(publicDoc))));
app.post('/api/admin/templates', admins, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 255);
  const body = String(req.body.body || '').trim();
  if (!name || !body) return res.status(400).json({ error: 'Template name and message body are required' });
  if (req.body.is_default) await collection('whatsapp_templates').updateMany({}, { $set: { is_default: false } });
  const template = { id: await nextId('whatsapp_templates'), name, body, is_default: Boolean(req.body.is_default) };
  await collection('whatsapp_templates').insertOne(template);
  res.status(201).json(template);
}));
app.put('/api/admin/templates/:id', admins, wrap(async (req, res) => {
  if (req.body.is_default) await collection('whatsapp_templates').updateMany({}, { $set: { is_default: false } });
  const changes = Object.fromEntries(['name', 'body', 'is_default'].filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  if (Object.keys(changes).length) await collection('whatsapp_templates').updateOne({ id: positiveId(req.params.id) || 0 }, { $set: changes });
  res.json({ ok: true });
}));
app.delete('/api/admin/templates/:id', admins, wrap(async (req, res) => {
  await collection('whatsapp_templates').deleteOne({ id: positiveId(req.params.id) || 0 });
  res.json({ ok: true });
}));

app.get('/api/admin/settings', admins, wrap(async (_, res) => {
  const setting = await collection('settings').findOne({ key: 'scrape_interval_min' });
  res.json({ scrape_interval_min: normalizeScrapeInterval(setting?.value) });
}));
app.put('/api/admin/settings/interval', admins, wrap(async (req, res) => {
  const minutes = Number(req.body.minutes);
  if (!isSupportedScrapeInterval(minutes)) return res.status(400).json({ error: 'Choose an interval from 5-59 minutes, 3 hours, or 6 hours' });
  await collection('settings').updateOne({ key: 'scrape_interval_min' }, { $set: { value: String(minutes) } }, { upsert: true });
  await schedule();
  res.json({ minutes });
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(frontendIndex);
});

let task;
async function schedule() {
  task?.stop();
  const setting = await collection('settings').findOne({ key: 'scrape_interval_min' });
  const minutes = normalizeScrapeInterval(setting?.value);
  task = cron.schedule(scrapeCronExpression(minutes), () => runAll()
    .then(wakeWhatsAppQueue)
    .catch(error => console.error('scheduled scrape failed', error)));
}

process.on('unhandledRejection', error => console.error('unhandled rejection', error));
await connectDB();
const whatsappQueueTask = setInterval(() => void processWhatsAppQueue(), 5000);
whatsappQueueTask.unref();
void processWhatsAppQueue();
const server = app.listen(process.env.PORT || 4000, () => {
  console.log(`API up on port ${process.env.PORT || 4000}`);
  schedule().catch(error => console.error('scheduler initialization failed', error));
});
process.on('SIGTERM', () => {
  task?.stop();
  clearInterval(whatsappQueueTask);
  server.close(async () => {
    await closeDB();
    process.exit(0);
  });
});
