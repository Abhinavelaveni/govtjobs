import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import robotsParser from 'robots-parser';
import { collection, nextId } from './db.js';
import { queueForJob } from './matcher.js';
import {
  parseFreeJobAlertArticle, parseFreeJobAlertListing, parseNtpcOpenAdvertisements,
  parseSahiJobArticle, parseSahiJobLinks, parseSbiCurrentOpenings, parseSourceDate,
  parseSscNoticeFeed, parseUpscRecruitmentRss
} from './adapters/official.js';
const UA = 'Mozilla/5.0 (compatible; GovJobsAlerts/1.0)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3, accept = 'text/html,application/json,application/rss+xml,application/xml;q=0.9,*/*;q=0.8') {
  for (let i = 1; i <= tries; i++) {
    try { return (await axios.get(url, { timeout: 15000, headers: { 'User-Agent': UA, Accept: accept } })).data; }
    catch (e) { if (i === tries) throw e; await sleep(1000 * 2 ** i); }
  }
}
async function allowed(url) {
  try { const o = new URL(url); const t = await get(`${o.origin}/robots.txt`, 1);
    return robotsParser(`${o.origin}/robots.txt`, t).isAllowed(url, UA) !== false; } catch { return true; }
}
export const fingerprint = j => crypto.createHash('sha256').update([j.organization, j.notification_no || '', j.notification_url].join('|').toLowerCase()).digest('hex');
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
        const savedJob = { ...j, id: await nextId('jobs'), fingerprint: fingerprint(j), source_id: id, qualification: j.qualification || [], verified: false, featured: false, created_at: new Date() };
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
