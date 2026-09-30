import * as cheerio from 'cheerio';

export const parseSourceDate = value => {
  if (!value) return null;
  const text = String(value).trim();
  const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
};

const absoluteUrl = (href, base) => {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
const issuerUrl = (href, base, source) => {
  const url = absoluteUrl(href, base);
  if (!url) return null;
  const hostname = new URL(url).hostname.toLowerCase();
  const configuredHosts = (source.config?.issuerHosts || []).map(host => String(host).toLowerCase());
  return /(?:^|\.)(?:gov\.in|nic\.in|ac\.in|edu\.in)$/.test(hostname) || configuredHosts.includes(hostname) ? url : null;
};
const dateFromText = value => {
  const text = cleanText(value);
  const direct = parseSourceDate(text);
  if (direct) return direct;
  const match = text.match(/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/);
  return match ? parseSourceDate(match[0]) : null;
};
const tableFields = ($, root = $.root()) => {
  const fields = new Map();
  root.find('tr').each((_, row) => {
    const cells = $(row).find('th,td');
    if (cells.length < 2) return;
    const label = cleanText($(cells[0]).text()).replace(/:$/, '').toLowerCase();
    const value = cleanText($(cells[1]).text());
    if (label && value && !fields.has(label)) fields.set(label, value);
  });
  return fields;
};
const fieldValue = (fields, pattern) => [...fields].find(([label]) => pattern.test(label))?.[1] || null;
const organizationFromTitle = title => title.match(/^(.+?)\s+(?:recruitment|vacancy|notification)\s+(?:\d{4}|for\b)/i)?.[1]?.trim() || null;

export function parseFreeJobAlertListing(html, source, now = new Date()) {
  const $ = cheerio.load(html);
  const today = now.toISOString().slice(0, 10);
  const articles = new Map();
  $('table.kar-table.kar-has-qual.kar-jobs').each((_, table) => {
    $(table).find('tr').each((__, row) => {
      const cells = $(row).find('td');
      if (cells.length < 7) return;
      const href = absoluteUrl($(cells[1]).find('a[href]').first().attr('href'), source.url);
      if (!href || new URL(href).hostname !== 'www.freejobalert.com') return;
      const lastDate = dateFromText($(cells[5]).text());
      if (!lastDate || lastDate <= today) return;
      const title = cleanText($(cells[1]).find('a').first().text()) || cleanText($(cells[1]).text());
      if (!title) return;
      articles.set(href, {
        articleUrl: href,
        title,
        vacancies: Number(cleanText($(cells[3]).text()).replace(/[^\d]/g, '')) || null,
        qualification: cleanText($(cells[4]).text()).split(/,\s*/).filter(Boolean),
        last_date: lastDate,
        published_at: dateFromText($(cells[0]).text())
      });
    });
  });
  return [...articles.values()];
}

export function parseFreeJobAlertArticle(html, source, summary, now = new Date()) {
  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text()) || summary.title;
  const fields = tableFields($);
  const lastDate = dateFromText(fieldValue(fields, /last date|closing date|application deadline/)) || summary.last_date;
  const today = now.toISOString().slice(0, 10);
  if (!title || !lastDate || lastDate <= today) return null;
  const anchors = $('a[href]').toArray();
  const notification = anchors.map(anchor => ({ anchor, url: issuerUrl($(anchor).attr('href'), summary.articleUrl, source) }))
    .find(({ anchor, url }) => url && /\.pdf(?:[?#]|$)/i.test(url) && /pdf|notification|advertisement/i.test(cleanText($(anchor).text()) + ' ' + url));
  if (!notification) return null;
  const application = anchors.map(anchor => ({ anchor, url: issuerUrl($(anchor).attr('href'), summary.articleUrl, source) }))
    .find(({ anchor, url }) => url && /apply|application|recruitment portal/i.test(cleanText($(anchor).text())));
  const organization = fieldValue(fields, /^(?:organization|company|recruiting body|recruiting organization)$/i) || organizationFromTitle(title);
  if (!organization) return null;
  const vacancyText = fieldValue(fields, /^(?:total vacancies|vacancies|number of posts|total posts)$/i);
  const qualification = fieldValue(fields, /^(?:qualification|required qualification|educational qualification)$/i);
  return {
    title,
    organization,
    category: source.config?.category || 'Central Government',
    gov_level: source.config?.gov_level || 'Central',
    vacancies: Number((vacancyText || '').replace(/[^\d]/g, '')) || summary.vacancies || null,
    qualification: qualification ? qualification.split(/,\s*/) : summary.qualification,
    start_date: dateFromText(fieldValue(fields, /application start|start date to apply/)),
    last_date: lastDate,
    notification_url: notification.url,
    application_url: application?.url || null,
    source_url: summary.articleUrl,
    published_at: dateFromText(fieldValue(fields, /notification date|post date|published date/)) || summary.published_at
  };
}

export function parseSahiJobLinks(html, source) {
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="/job/"]').each((_, anchor) => {
    const url = absoluteUrl($(anchor).attr('href'), source.url);
    if (url && new URL(url).hostname === 'www.sahisarkarijobs.in' && new URL(url).pathname !== '/job/') links.add(url);
  });
  return [...links];
}

export function parseSahiJobArticle(html, source, articleUrl, now = new Date()) {
  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text());
  const fields = tableFields($, $('article').length ? $('article').first() : $.root());
  const lastDate = dateFromText(fieldValue(fields, /last date|application deadline|closing date/));
  const today = now.toISOString().slice(0, 10);
  if (!title || !lastDate || lastDate <= today) return null;
  const anchors = $('article a[href]').length ? $('article a[href]').toArray() : $('a[href]').toArray();
  const issuerLinks = anchors.map(anchor => ({ anchor, url: issuerUrl($(anchor).attr('href'), articleUrl, source) })).filter(item => item.url);
  const notification = issuerLinks.find(({ anchor, url }) => /\.pdf(?:[?#]|$)/i.test(url) && /pdf|notification|advertisement/i.test(cleanText($(anchor).text()) + ' ' + url));
  const application = issuerLinks.find(({ anchor }) => /apply|application|recruitment portal/i.test(cleanText($(anchor).text())));
  const organization = fieldValue(fields, /^(?:organization|organization name|recruiting body|department)$/i) || organizationFromTitle(title);
  if (!organization || (!notification && !application)) return null;
  const vacancyText = fieldValue(fields, /^(?:total vacancies|vacancies|number of posts)$/i);
  const qualification = fieldValue(fields, /^(?:qualification|required qualification|educational qualification)$/i);
  return {
    title,
    organization,
    category: source.config?.category || 'Other',
    gov_level: source.config?.gov_level || null,
    vacancies: Number((vacancyText || '').replace(/[^\d]/g, '')) || null,
    qualification: qualification ? qualification.split(/,\s*/) : [],
    start_date: dateFromText(fieldValue(fields, /application start|start date to apply/)),
    last_date: lastDate,
    notification_url: notification?.url || null,
    application_url: application?.url || null,
    source_url: articleUrl,
    published_at: dateFromText(fieldValue(fields, /notification release date|notification date|published date/))
  };
}

export function parseNtpcOpenAdvertisements(html, source, now = new Date()) {
  const $ = cheerio.load(html);
  const today = now.toISOString().slice(0, 10);
  const jobs = [];
  $('ul.post-job-bx > li').each((_, element) => {
    const card = $(element);
    const heading = cleanText(card.find('h5').first().text());
    if (!/open apply/i.test(heading) || !card.find('.new-vacancy').length) return;
    const advertisement = heading.match(/advt?\.?\s*(?:no\.?)?\s*([\w/-]+)/i)?.[1] || null;
    const startDate = dateFromText(card.find('.start-date').text());
    const lastDate = dateFromText(card.find('.end-date').text());
    if (!advertisement || !startDate || !lastDate || lastDate <= today) return;
    const pdf = card.find('a[href*="pdf_viewer.php"]').map((__, anchor) => absoluteUrl($(anchor).attr('href'), source.url)).get().find(Boolean);
    if (!pdf || new URL(pdf).hostname !== new URL(source.url).hostname) return;
    const description = cleanText(card.find('.job-text').text()).replace(/^advertisement text\s*:\s*/i, '');
    if (!description) return;
    jobs.push({
      title: description,
      organization: source.config?.organization || 'NTPC Limited',
      category: source.config?.category || 'PSU',
      gov_level: source.config?.gov_level || 'Central',
      recruitment_no: advertisement,
      notification_no: advertisement,
      start_date: startDate,
      last_date: lastDate,
      notification_url: pdf,
      application_url: null,
      source_url: source.config?.sourcePage || source.url,
      published_at: null
    });
  });
  return jobs;
}

export function parseSbiCurrentOpenings(html, source, now = new Date()) {
  const $ = cheerio.load(html);
  const today = now.toISOString().slice(0, 10);
  const jobs = [];

  $('.card .accordion').each((_, element) => {
    const card = $(element).closest('.card');
    const text = card.text().replace(/\s+/g, ' ').trim();
    const titleElement = card.find('.row p').filter((__, paragraph) => !/ADVERTISEMENT NO/i.test($(paragraph).text())).first();
    const title = titleElement.text().replace(/\s*\(\s*apply online.*?\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
    const notificationNumber = card.find('.row p').filter((__, paragraph) => /ADVERTISEMENT NO/i.test($(paragraph).text())).first().text().match(/ADVERTISEMENT NO\s*:\s*(.+)/i)?.[1]?.trim();
    const deadlineText = text.match(/LAST DATE TO APPLY\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)?.[1];
    const lastDate = parseSourceDate(deadlineText);
    const applicationLink = card.find('.accordion-content a[href]').filter((__, anchor) => /apply online/i.test($(anchor).text())).first();
    const notificationLink = card.find('.accordion-content a[href]').filter((__, anchor) => /\.pdf(?:[/?#]|$)/i.test($(anchor).attr('href') || '')).first();
    const applicationUrl = absoluteUrl(applicationLink.attr('href'), source.url);
    const notificationUrl = absoluteUrl(notificationLink.attr('href'), source.url);

    if (!title || !notificationNumber || !applicationUrl || !notificationUrl || !lastDate || lastDate <= today) return;

    const applicationWindow = titleElement.text().match(/apply online from\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+to\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i);
    jobs.push({
      title,
      organization: source.config?.organization || 'State Bank of India',
      category: source.config?.category || 'Banking',
      gov_level: source.config?.gov_level || 'Central',
      recruitment_no: notificationNumber,
      notification_no: notificationNumber,
      start_date: parseSourceDate(applicationWindow?.[1]),
      last_date: lastDate,
      notification_url: notificationUrl,
      application_url: applicationUrl,
      source_url: source.config?.sourcePage || source.url,
      published_at: null
    });
  });

  return jobs;
}

const isRecruitmentNotice = headline => {
  if (/answer key|admit card|result|marks secured|response sheet|exam city|exam centre|tentative vacancy|calendar|challenge window|skill test|interview schedule/i.test(headline)) return false;
  return /recruitment of|recruitment notification|inviting applications|applications? for the post|apply online for/i.test(headline);
};

export function parseSscNoticeFeed(feed, source) {
  const items = Array.isArray(feed?.data) ? feed.data : [];
  const jobs = [];

  for (const item of items) {
    const title = String(item.headline || '').replace(/\s+/g, ' ').trim();
    if (!title || !isRecruitmentNotice(title)) continue;

    const attachment = (item.attachments || []).find(file => file.path && (file.type === 'application/pdf' || /\.pdf$/i.test(file.fileName || file.path)));
    const notificationUrl = attachment && absoluteUrl(`/api/attachment/${String(attachment.path).replace(/\\/g, '/').replace(/^\/+/, '')}`, source.url);
    if (!notificationUrl) continue;

    jobs.push({
      title,
      organization: source.config?.organization || 'Staff Selection Commission',
      category: source.config?.category || 'Central Government',
      gov_level: source.config?.gov_level || 'Central',
      notification_url: notificationUrl,
      application_url: absoluteUrl(item.redirectUrl, source.url),
      source_url: source.config?.sourcePage || source.url,
      published_at: parseSourceDate(item.createdAt)
    });
  }

  return jobs;
}

export function parseUpscRecruitmentRss(xml, source) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs = [];

  $('item').each((_, element) => {
    const item = $(element);
    const link = absoluteUrl(item.find('link').first().text().trim(), source.url);
    const identifier = (item.find('guid').first().text() || item.find('description').first().text()).replace(/\s+/g, ' ').trim();
    const officialPdf = link && /^https:\/\/(?:www\.)?upsc\.gov\.in\/sites\/default\/files\/.+\.pdf(?:[?#]|$)/i.test(link);
    if (!identifier || !officialPdf || !/advertisement\s*(?:no\.?|number)/i.test(identifier)) return;

    jobs.push({
      title: `UPSC Recruitment ${identifier}`,
      organization: source.config?.organization || 'Union Public Service Commission',
      category: source.config?.category || 'Central Government',
      gov_level: source.config?.gov_level || 'Central',
      recruitment_no: identifier,
      notification_no: identifier,
      notification_url: link,
      application_url: null,
      source_url: source.config?.sourcePage || 'https://upsc.gov.in/recruitment/recruitment-advertisement',
      published_at: parseSourceDate(item.find('pubDate').first().text())
    });
  });

  return jobs;
}