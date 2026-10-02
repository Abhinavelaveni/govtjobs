export const WHATSAPP_WINDOW_MS = 60 * 60 * 1000;
export const WHATSAPP_MESSAGES_PER_WINDOW = 4;

export function nextWhatsAppAttemptAt(attempts, now = new Date()) {
  const recent = attempts
    .map(value => new Date(value).getTime())
    .filter(value => Number.isFinite(value) && value > now.getTime() - WHATSAPP_WINDOW_MS)
    .sort((left, right) => left - right);
  return recent.length < WHATSAPP_MESSAGES_PER_WINDOW
    ? now
    : new Date(recent[recent.length - WHATSAPP_MESSAGES_PER_WINDOW] + WHATSAPP_WINDOW_MS);
}

export function retryDelayMs(retryCount) {
  return Math.min(60_000 * 2 ** Math.max(0, Number(retryCount) - 1), 6 * WHATSAPP_WINDOW_MS);
}

export async function reserveWhatsAppSlot(rateLimits, phone, now = new Date()) {
  try {
    await rateLimits.updateOne({ _id: phone }, { $setOnInsert: { attempts: [] } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const cutoff = new Date(now.getTime() - WHATSAPP_WINDOW_MS);
  const recentAttempts = {
    $filter: {
      input: { $ifNull: ['$attempts', []] },
      as: 'attempt',
      cond: { $gt: ['$$attempt', cutoff] }
    }
  };
  const reserved = await rateLimits.findOneAndUpdate(
    { _id: phone, $expr: { $lt: [{ $size: recentAttempts }, WHATSAPP_MESSAGES_PER_WINDOW] } },
    [{ $set: { attempts: { $concatArrays: [recentAttempts, [now]] } } }],
    { returnDocument: 'after', includeResultMetadata: false }
  );
  if (reserved) return { reserved: true, nextAt: now };

  const current = await rateLimits.findOne({ _id: phone }, { projection: { attempts: 1 } });
  return { reserved: false, nextAt: nextWhatsAppAttemptAt(current?.attempts || [], now) };
}