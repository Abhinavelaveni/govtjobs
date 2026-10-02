import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import robotsParser from 'robots-parser';
import { collection, nextId } from './db.js';
import { queueForJob } from './matcher.js';
import {
  parseEmploymentNewsJobs, parseFreeJobAlertArticle, parseFreeJobAlertListing, parseGovtJobGuruListing, parseIbpsRecruitmentUpdates,
  parseNtpcOpenAdvertisements, parseRrbCenNotifications,
  parseSahiJobArticle, parseSahiJobLinks, parseSbiCurrentOpenings, parseSourceDate,
  parseSscNoticeFeed, parseUpscRecruitmentRss
} from './adapters/official.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const acceptHeader = 'text/html,application/xhtml+xml,application/json,application/rss+xml,application/xml;q=0.9,*/*;q=0.8';
const requestOptions = (url, referer = `${new URL(url).origin}/`, accept = acceptHeader) => ({
  timeout: 30000,
  headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-IN,en;q=0.9', Referer: referer }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3, accept = acceptHeader) {
  for (let i = 1; i <= tries; i++) {
    try { return (await axios.get(url, requestOptions(url, `${new URL(url).origin}/`, accept))).data; }
    catch (e) { if (i === tries) throw e; await sleep(1000 * 2 ** i); }
  }
}
async function allowed(url) {
  try { const o = new URL(url); const t = await get(`${o.origin}/robots.txt`, 1);
    return robotsParser(`${o.origin}/robots.txt`, t).isAllowed(url, UA) !== false; } catch { return true; }
}
const normalizeNoticeText = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLowerCase();
const canonicalNoticeUrl = value => {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${url.pathname}`;
  } catch { return String(value ?? '').trim().toLowerCase(); }
};
export const fingerprint = job => {
  const organization = normalizeNoticeText(job.organization);
  const reference = normalizeNoticeText(job.notification_no || job.recruitment_no);
  const date = job.last_date || job.published_at;
  const identity = reference
    ? `reference:${reference}`
    : normalizeNoticeText(job.title) && date
      ? `notice:${normalizeNoticeText(job.title)}|${date}`
      : `url:${canonicalNoticeUrl(job.notification_url)}`;
  return crypto.createHash('sha256').update(`${organization}|${identity}`).digest('hex');
};

async function findExistingNotice(job, noticeFingerprint) {
  const jobs = collection('jobs');
  const duplicate = await jobs.findOne({ fingerprint: noticeFingerprint }, { projection: { id: 1 } });
  if (duplicate) return duplicate;

  const organization = String(job.organization || '').trim();
  const references = [...new Set([job.notification_no, job.recruitment_no].map(value => String(value || '').trim()).filter(Boolean))];
  let identity;
  if (references.length) {
    identity = {
      organization,
      $or: references.flatMap(value => [{ notification_no: value }, { recruitment_no: value }])
    };
  } else {
    const dateField = job.last_date ? 'last_date' : job.published_at ? 'published_at' : null;
    if (!dateField || !job.title) return null;
    identity = { organization, title: String(job.title).trim(), [dateField]: job[dateField] };
  }
  return jobs.findOne(identity, { projection: { id: 1 }, collation: { locale: 'en', strength: 2 } });
}
// Config-driven adapter. Add site-specific adapters in ADAPTERS when a site needs custom logic.
// config: { item, title, link, date, organization, category, gov_level, pages:[urls] }
async function generic(src) {
  const c = src.config, out = [];
  if (!c?.item || !c?.title || !c?.link) throw new Error('Configure item, title, and link selectors before scraping this source');
  for (const page of c.pages || [src.url]) {
    const $ = cheerio.load(await get(page));
    $(c.item).each((_, el) => {
      const a = $(el).find(c.link).first(), title = $(el).find(c.title).first().text().trim() || a.text().trim();
      const href = a.attr('href');
      if (!title || !href) return; // never fabricate missing data
      const extract = selector => selector ? $(el).find(selector).map((__, node) => $(node).text().trim()).get().filter(Boolean) : [];
      const scalar = selector => extract(selector)[0] || null;
      const number = Number(String(scalar(c.vacancies) || '').replace(/[^\d]/g, '')) || null;
      const date = selector => parseSourceDate(scalar(selector));
      const application = c.applicationLink ? $(el).find(c.applicationLink).first().attr('href') : null;
      let notificationUrl, applicationUrl;
      try { notificationUrl = new URL(href, page).href; } catch { return; }
      try { applicationUrl = application ? new URL(application, page).href : null; } catch { applicationUrl = null; }
      out.push({
        title,
        organization: c.organization || src.name,
        department: scalar(c.department),
        recruitment_no: scalar(c.recruitmentNumber),
        notification_no: scalar(c.notificationNumber),
        category: c.category || 'Other',
        gov_level: c.gov_level || null,
        vacancies: number,
        qualification: extract(c.qualification),
        age_limit: scalar(c.ageLimit),
        salary: scalar(c.salary),
        experience: scalar(c.experience),
        location: scalar(c.location),
        start_date: date(c.startDate),
        last_date: date(c.lastDate),
        fee: scalar(c.fee),
        selection_process: scalar(c.selectionProcess),
        exam_date: date(c.examDate),
        notification_url: notificationUrl,
        application_url: applicationUrl,
        source_url: page,
        published_at: date(c.date)
      });
    });
    await sleep(2000); // polite rate limit
  }
  return out;
}

const ADAPTERS = {
  generic,
  'upsc-rss': async source => parseUpscRecruitmentRss(await get(source.url, 3, 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'), source),
  'ibps-updates': async source => parseIbpsRecruitmentUpdates(await get(source.url), source),
  'employment-news': async source => parseEmploymentNewsJobs(await get(source.url), source),
  govtjobguru: async source => parseGovtJobGuruListing(await get(source.url), source),
  'rrb-notices': async source => {
    const home = await axios.get(source.url, requestOptions(source.url));
    const $ = cheerio.load(home.data);
    const cookies = new Map();
    const saveCookies = response => {
      for (const cookie of response.headers['set-cookie'] || []) {
        const separator = cookie.indexOf('=');
        if (separator > 0) cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1).split(';')[0]);
      }
    };
    saveCookies(home);
    const feedLinks = [];
    $('a[href]').each((_, anchor) => {
      const href = $(anchor).attr('href');
      if (!href || String($(anchor).text()).replace(/\s+/g, ' ').trim() !== 'Notification') return;
      const url = new URL(href, source.url);
      if (url.pathname !== '/getdata' || !url.searchParams.get('cennum')) return;
      const cen = url.searchParams.get('cennum');
      if (feedLinks.some(link => link.cen === cen)) return;
      feedLinks.push({ cen, url: url.href });
    });
    feedLinks.sort((left, right) => {
      const [leftNumber, leftYear] = left.cen.split('/').map(Number);
      const [rightNumber, rightYear] = right.cen.split('/').map(Number);
      return rightYear - leftYear || rightNumber - leftNumber;
    });
    const results = [];
    let successfulFeeds = 0;
    let lastError;
    const limit = Math.max(1, Math.min(12, Number(source.config?.cenLimit) || 8));
    for (const feed of feedLinks.slice(0, limit)) {
      try {
        const cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
        const response = await axios.get(feed.url, {
          ...requestOptions(feed.url, source.url),
          headers: { ...requestOptions(feed.url, source.url).headers, Cookie: cookieHeader, 'X-Requested-With': 'XMLHttpRequest' }
        });
        saveCookies(response);
        successfulFeeds++;
        results.push(...parseRrbCenNotifications(response.data, source));
      } catch (error) {
        lastError = error;
        console.warn('RRB CEN feed skipped', feed.cen, error.message);
      }
      await sleep(750);
    }
    if (feedLinks.length && !successfulFeeds && lastError) throw lastError;
    return results;
  },
  'ssc-notices': async source => {
    const base = new URL(source.url).origin;
    const limit = Math.max(1, Math.min(5, Number(source.config?.pageLimit) || 3));
    const jobs = [];
    for (let page = 1; page <= limit; page++) {
      const { data } = await axios.get(`${base}/api/general-website/portal/notice-boards`, {
        params: {
          page, limit: 10, contentType: 'notice-boards', key: 'createdAt', order: 'DESC', isAttachment: true,
          attributes: 'id,headline,examId,contentType,redirectUrl,startDate,endDate,language,createdAt', language: 'english'
        },
        timeout: 15000,
        headers: { 'User-Agent': UA, Referer: base, Accept: 'application/json, text/plain, */*' }
      });
      jobs.push(...parseSscNoticeFeed(data, source));
      if (!Array.isArray(data?.data) || data.data.length < 10) break;
      await sleep(2000);
    }
    return jobs;
  },
  'sbi-careers': async source => parseSbiCurrentOpenings(await get(source.url), source),
  'freejobalert-telangana': async source => {
    const listing = await get(source.url);
    const summaries = parseFreeJobAlertListing(listing, source);
    const limit = Math.max(1, Math.min(30, Number(source.config?.articleLimit) || 15));
    const jobs = [];
    for (const summary of summaries.slice(0, limit)) {
      if (await allowed(summary.articleUrl)) {
        try {
          const article = await get(summary.articleUrl);
          const job = parseFreeJobAlertArticle(article, source, summary);
          if (job) jobs.push(job);
        } catch (error) { console.warn('FreeJobAlert article skipped', summary.articleUrl, error.message); }
      }
      await sleep(2000);
    }
    return jobs;
  },
  'sahi-sarkari-jobs': async source => {
    const listing = await get(source.url);
    const links = parseSahiJobLinks(listing, source);
    const limit = Math.max(1, Math.min(30, Number(source.config?.articleLimit) || 15));
    const jobs = [];
    for (const articleUrl of links.slice(0, limit)) {
      if (await allowed(articleUrl)) {
        try {
          const article = await get(articleUrl);
          const job = parseSahiJobArticle(article, source, articleUrl);
          if (job) jobs.push(job);
        } catch (error) { console.warn('Sahi Sarkari article skipped', articleUrl, error.message); }
      }
      await sleep(2000);
    }
    return jobs;
  },
  'ntpc-careers': async source => parseNtpcOpenAdvertisements(await get(source.url), source)
};

export async function scrapeConfiguredSource(source) {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) throw new Error(`Unknown Node scraper adapter: ${source.adapter}`);
  return adapter(source);
}

export async function runSource(id) {
  const src = await collection('job_sources').findOne({ id });
  if (!src) throw new Error('source not found');
  const run = { id: await nextId('scraper_runs') };
  await collection('scraper_runs').insertOne({ id: run.id, source_id: id, started_at: new Date(), found: 0, new_jobs: 0, duplicates: 0, errors: 0, log: '' });
  const s = { found: 0, new_jobs: 0, duplicates: 0, errors: 0, log: '' };
  await collection('job_sources').updateOne({ id }, { $set: { status: 'running' } });
  try {
    if (!(await allowed(src.url))) throw new Error('blocked by robots.txt');
    const jobs = await scrapeConfiguredSource(src);
    s.found = jobs.length;
    for (const j of jobs) {
      try {
        const jobFingerprint = fingerprint(j);
        if (await findExistingNotice(j, jobFingerprint)) { s.duplicates++; continue; }
        const importedAt = new Date();
        const savedJob = { ...j, id: await nextId('jobs'), fingerprint: jobFingerprint, source_id: id, qualification: j.qualification || [], verified: false, featured: false, created_at: importedAt, updated_at: importedAt };
        try { await collection('jobs').insertOne(savedJob); } catch (error) {
          if (error.code === 11000) { s.duplicates++; continue; }
          throw error;
        }
        s.new_jobs++; await queueForJob(savedJob, src.name);
      } catch (e) { s.errors++; s.log += `${j.title}: ${e.message}\n`; }
    }
    await collection('job_sources').updateOne({ id }, { $set: { status: 'ok', last_run: new Date() } });
  } catch (e) { s.errors++; s.log += e.message; await collection('job_sources').updateOne({ id }, { $set: { status: 'error', last_run: new Date() } }); }
  await collection('scraper_runs').updateOne({ id: run.id }, { $set: { finished_at: new Date(), ...s } });
  return s;
}
export async function runAll() {
  const sources = await collection('job_sources').find({ enabled: true }, { projection: { id: 1 } }).toArray();
  for (const source of sources) { try { await runSource(source.id); } catch (e) { console.error('scrape failed', source.id, e.message); } }
}
