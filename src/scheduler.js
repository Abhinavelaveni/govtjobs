export function isSupportedScrapeInterval(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && (minutes >= 5 && minutes <= 59 || minutes === 180 || minutes === 360);
}

export function normalizeScrapeInterval(value) {
  return isSupportedScrapeInterval(value) ? Number(value) : 30;
}

export function scrapeCronExpression(minutes) {
  if (!isSupportedScrapeInterval(minutes)) throw new RangeError('Unsupported scrape interval');
  return minutes >= 60 ? `0 */${minutes / 60} * * *` : `*/${minutes} * * * *`;
}