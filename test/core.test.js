import test from 'node:test';
import assert from 'node:assert/strict';
import { matches, normalizeForSearch, whatsappLimitReached } from '../src/matcher.js';
import { render } from '../src/templates.js';
import { api } from '../frontend/src/api.js';
import { PRESETS } from '../src/adapters/presets.js';
import { fingerprint } from '../src/scraper.js';
import {
  parseFreeJobAlertArticle, parseFreeJobAlertListing, parseNtpcOpenAdvertisements,
  parseSahiJobArticle, parseSahiJobLinks, parseSbiCurrentOpenings,
  parseSscNoticeFeed, parseUpscRecruitmentRss
} from '../src/adapters/official.js';
const job = { title: 'Software Engineer', category: 'IT', gov_level: 'Central', qualification: ['B.Tech'], location: 'All India' };
const pref = { whatsapp_optin: true, opted_out: false, gov_level: 'Both', categories: ['IT'], education: 'B.Tech', locations: ['Telangana'], keywords: ['engineer'] };
test('source presets retain tier and authority metadata', () => {
  const source = name => PRESETS.find(preset => preset.name === name);
  assert.equal(source('NTPC Careers').config.sourceTier, 'tier1');
  assert.equal(source('FreeJobAlert Telangana').config.sourceTier, 'tier2');
  assert.equal(source('Sahi Sarkari Jobs').config.sourceAuthority, 'aggregator');
  assert.equal(source('FreeJobAlert Telangana').enabled, false);
});
test('normalizes accents and punctuation for search filters', () => {
  assert.equal(normalizeForSearch('B.Tech'), 'b tech');
  assert.equal(normalizeForSearch('Maharashtra & Goa'), 'maharashtra and goa');
  assert.equal(normalizeForSearch('Árjuna - engineering'), 'arjuna engineering');
});

test('whatsapp contact limit blocks more than four sends in an hour', () => {
  assert.equal(whatsappLimitReached(3), false);
  assert.equal(whatsappLimitReached(4), true);
});
test('API retries transient GET failures but never replays a POST', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let getCalls = 0;
  let postCalls = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  globalThis.fetch = async (_, options) => {
    if (options.method === 'GET') {
      getCalls += 1;
      return getCalls === 1
        ? { ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ ready: true }) };
    }
    postCalls += 1;
    return { ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) };
  };
  try {
    assert.deepEqual(await api('/health'), { ready: true });
    await assert.rejects(api('/notifications/1/send', 'POST', {}), /Bad Gateway/);
    assert.equal(getCalls, 2);
    assert.equal(postCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('matches eligible user', () => assert.equal(matches(job, pref), true));
test('accepts normalized qualification and keyword variants', () => {
  const normalizedJob = { title: 'Assistant Engineer', category: 'Engineering', gov_level: 'Central', qualification: ['B.Tech'], location: 'Maharashtra' };
  assert.equal(matches(normalizedJob, { ...pref, categories: ['Engineering'], education: 'B Tech', keywords: ['assistant engineer'], locations: ['maharashtra'] }), true);
});
test('rejects opted-out user', () => assert.equal(matches(job, { ...pref, opted_out: true }), false));
test('rejects no consent', () => assert.equal(matches(job, { ...pref, whatsapp_optin: false }), false));
test('rejects wrong category', () => assert.equal(matches(job, { ...pref, categories: ['Banking'] }), false));
test('rejects wrong qualification', () => assert.equal(matches(job, { ...pref, education: 'B.Ed' }), false));
test('rejects wrong government level', () => assert.equal(matches(job, { ...pref, gov_level: 'State' }), false));
test('rejects keyword miss', () => assert.equal(matches(job, { ...pref, keywords: ['teacher'] }), false));
test('location mismatch rejected, All India allowed', () => {
  assert.equal(matches({ ...job, location: 'Kerala' }, pref), false);
  assert.equal(matches(job, pref), true);
});
test('template fills fields and never invents data', () => {
  const m = render({ title: 'T', organization: 'O', notification_url: 'https://x' }, 'Src', '{JOB_TITLE}|{VACANCIES}|{APPLICATION_URL}');
  assert.equal(m, 'T|Not specified|https://x');
});
test('fingerprint stable and case-insensitive', () => {
  const a = { organization: 'UPSC', notification_no: '1/2026', notification_url: 'https://a' };
  assert.equal(fingerprint(a), fingerprint({ ...a, organization: 'upsc' }));
  assert.notEqual(fingerprint(a), fingerprint({ ...a, notification_no: '2/2026' }));
});
test('SBI parser keeps live official openings and their verified links', () => {
  const html = `<div class="card"><div class="accordion"><div class="row"><div><p>RECRUITMENT OF ASSISTANT MANAGER (Apply Online from 01.01.2099 to 31.12.2099)</p><p>ADVERTISEMENT NO: CRPD/TEST/2099/01</p></div><button>LAST DATE TO APPLY : 31-12-2099</button></div></div><div class="accordion-content"><a href="/documents/notice.pdf">English (PDF)</a><a href="https://recruitment.sbi.bank.in/test/apply">APPLY ONLINE</a></div></div>`;
  const jobs = parseSbiCurrentOpenings(html, { url: 'https://sbi.bank.in/web/careers/current-openings' }, new Date('2099-01-01T00:00:00Z'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'RECRUITMENT OF ASSISTANT MANAGER');
  assert.equal(jobs[0].notification_no, 'CRPD/TEST/2099/01');
  assert.equal(jobs[0].last_date, '2099-12-31');
  assert.equal(jobs[0].notification_url, 'https://sbi.bank.in/documents/notice.pdf');
  assert.equal(jobs[0].application_url, 'https://recruitment.sbi.bank.in/test/apply');
  assert.equal(parseSbiCurrentOpenings(html, { url: 'https://sbi.bank.in/web/careers/current-openings' }, new Date('2100-01-01T00:00:00Z')).length, 0);
});
test('SSC parser filters exam outcomes and keeps official recruitment PDFs', () => {
  const feed = { data: [
    { headline: 'Recruitment of Scientific Assistant in IMD through Junior Engineer Examination', createdAt: '2026-09-16T06:41:14.900Z', attachments: [{ type: 'application/pdf', path: 'uploads\\masterData\\NoticeBoards\\notice.pdf' }] },
    { headline: 'Stenographer Examination 2026: Tentative Answer Key and Response Sheet', attachments: [{ type: 'application/pdf', path: 'uploads\\masterData\\NoticeBoards\\key.pdf' }] },
    { headline: 'Recruitment of Clerks', attachments: [] }
  ] };
  const jobs = parseSscNoticeFeed(feed, { url: 'https://ssc.gov.in/' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Recruitment of Scientific Assistant in IMD through Junior Engineer Examination');
  assert.equal(jobs[0].notification_url, 'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/notice.pdf');
  assert.equal(jobs[0].published_at, '2026-09-16');
});
test('UPSC RSS parser skips malformed entries and uses the official ad number', () => {
  const xml = `<rss><channel><item><title>Union Public Service Commission</title><link>https://upsc.gov.in/sites/default/files/Advt_03_2026.pdf</link><guid>Advertisement No. 03/2026</guid><pubDate>Fri, 24 Apr 2026 00:00:00 +0000</pubDate></item><item><guid>Advertisement No. 04/2026</guid><pubDate>Thu, 01 Jan 1970 00:00:00 +0000</pubDate></item></channel></rss>`;
  const jobs = parseUpscRecruitmentRss(xml, { url: 'https://upsc.gov.in/rss.php' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'UPSC Recruitment Advertisement No. 03/2026');
  assert.equal(jobs[0].notification_no, 'Advertisement No. 03/2026');
  assert.equal(jobs[0].published_at, '2026-04-24');
});

test('FreeJobAlert listing selects only live job tables and deduplicates articles', () => {
  const source = { url: 'https://www.freejobalert.com/telangana-government-jobs/' };
  const html = `<table class="kar-table kar-has-qual kar-jobs"><tr><th>Post Date</th><th>Job Title</th><th>Post name</th><th>Vacancies</th><th>Qualification</th><th>Last Date</th><th>Notification</th></tr><tr><td>01/01/2099</td><td><a href="/articles/example-recruitment-2099">Example Recruitment 2099</a></td><td>Clerk</td><td>12 Posts</td><td>Any Graduate</td><td>31/12/2099</td><td>View</td></tr><tr><td>01/01/2098</td><td><a href="/articles/expired-recruitment-2098">Expired Recruitment</a></td><td>Clerk</td><td>3</td><td>Graduate</td><td>31/12/2098</td><td>View</td></tr></table><table class="kar-table kar-has-qual kar-jobs kar-tbl-alt"><tr><td>01/01/2099</td><td><a href="https://www.freejobalert.com/articles/example-recruitment-2099">Duplicate</a></td><td>Clerk</td><td>12</td><td>Any Graduate</td><td>31/12/2099</td><td>View</td></tr></table><table><tr><td><a href="/articles/result-2099">Exam result</a></td></tr></table>`;
  const summaries = parseFreeJobAlertListing(html, source, new Date('2099-01-01T00:00:00Z'));
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].vacancies, 12);
  assert.equal(summaries[0].last_date, '2099-12-31');
});

test('FreeJobAlert article requires issuer-hosted notice and preserves article attribution', () => {
  const source = { url: 'https://www.freejobalert.com/telangana-government-jobs/', config: { category: 'Other' } };
  const summary = { articleUrl: 'https://www.freejobalert.com/articles/example-recruitment-2099', title: 'Example Recruitment 2099', last_date: '2099-12-31', vacancies: 12, qualification: ['Any Graduate'] };
  const html = `<h1>Example Recruitment 2099 - Apply Online</h1><table><tr><td>Recruiting Body</td><td>Example Board</td></tr><tr><td>Total Vacancies</td><td>12</td></tr><tr><td>Qualification</td><td>Any Graduate</td></tr><tr><td>Last Date to Apply</td><td>31 December 2099</td></tr></table><a href="https://mirror.example.com/notice.pdf">Notification PDF</a><a href="https://example.gov.in/notice.pdf">Official Notification PDF</a><a href="https://apply.example.gov.in/form">Apply Online</a>`;
  const job = parseFreeJobAlertArticle(html, source, summary, new Date('2099-01-01T00:00:00Z'));
  assert.equal(job.organization, 'Example Board');
  assert.equal(job.notification_url, 'https://example.gov.in/notice.pdf');
  assert.equal(job.application_url, 'https://apply.example.gov.in/form');
  assert.equal(job.source_url, summary.articleUrl);
  assert.equal(parseFreeJobAlertArticle(html.replace('example.gov.in/notice.pdf', 'mirror.example.com/notice.pdf'), source, summary, new Date('2099-01-01T00:00:00Z')), null);
});

test('Sahi Sarkari parses only own job links and explicit live details', () => {
  const source = { url: 'https://www.sahisarkarijobs.in/', config: {} };
  const listing = `<a href="/job/">All Jobs</a><a href="/job/example-board-recruitment-2099/">Example Board</a><a href="https://evil.example/job/fake/">Fake</a>`;
  const links = parseSahiJobLinks(listing, source);
  assert.deepEqual(links, ['https://www.sahisarkarijobs.in/job/example-board-recruitment-2099/']);
  const html = `<article><h1>Example Board Recruitment 2099</h1><table><tr><td>Organization Name</td><td>Example Board</td></tr><tr><td>Vacancies</td><td>7</td></tr><tr><td>Last Date to Apply</td><td>31 December 2099</td></tr></table><a href="https://cdn.example.com/copy.pdf">Download Notification PDF</a><a href="https://example.gov.in/apply">Apply Online</a></article>`;
  const job = parseSahiJobArticle(html, source, links[0], new Date('2099-01-01T00:00:00Z'));
  assert.equal(job.organization, 'Example Board');
  assert.equal(job.notification_url, null);
  assert.equal(job.application_url, 'https://example.gov.in/apply');
  assert.equal(parseSahiJobArticle(html, source, links[0], new Date('2100-01-01T00:00:00Z')), null);
});

test('NTPC parser keeps only marked open ads with future dates and official PDFs', () => {
  const source = { url: 'https://careers.ntpc.co.in/recruitment/', config: { sourcePage: 'https://careers.ntpc.co.in/recruitment/' } };
  const html = `<ul class="post-job-bx"><li><h5>Advt No. 13/99 - Open Apply <span class="new-vacancy">New</span></h5><div class="job-text">Special Recruitment Drive for SC/ST candidates</div><div class="start-date">Application Start dt: 2026-09-29</div><div class="end-date">End dt: 2099-10-13</div><a href="login.php">Apply</a><a href="pdf_viewer.php?token=notice">Advertisement PDF</a></li><li><h5>Advt No. 14/99 - Open Apply</h5><div class="job-text">Unmarked vacancy</div><div class="start-date">2026-09-29</div><div class="end-date">2099-10-13</div><a href="pdf_viewer.php?token=old">PDF</a></li><li><h5>Advt No. 15/99 - Open Apply <span class="new-vacancy">New</span></h5><div class="job-text">Expired vacancy</div><div class="start-date">2026-09-29</div><div class="end-date">2098-10-13</div><a href="pdf_viewer.php?token=expired">PDF</a></li></ul>`;
  const jobs = parseNtpcOpenAdvertisements(html, source, new Date('2099-01-01T00:00:00Z'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].notification_no, '13/99');
  assert.equal(jobs[0].notification_url, 'https://careers.ntpc.co.in/recruitment/pdf_viewer.php?token=notice');
  assert.equal(jobs[0].application_url, null);
});
