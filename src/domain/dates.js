export const DAY_MS = 86_400_000;

/** Date key format used everywhere: YYYY-MM-DD (UTC based, no timezone drift). */
export function dateKey(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

export function parseKey(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(parseKey(key).getTime());
}

export function addDays(key, days) {
  return new Date(parseKey(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  return Math.round((parseKey(checkOut).getTime() - parseKey(checkIn).getTime()) / DAY_MS);
}

/** Night keys occupied by a stay: check-in inclusive, check-out exclusive. */
export function nightKeys(checkIn, checkOut) {
  const total = nightsBetween(checkIn, checkOut);
  const keys = [];
  for (let i = 0; i < total; i += 1) keys.push(addDays(checkIn, i));
  return keys;
}

/** Inclusive list of date keys (used by partner calendar). */
export function eachDateKey(from, to) {
  const total = nightsBetween(from, to) + 1;
  const keys = [];
  for (let i = 0; i < Math.max(0, total); i += 1) keys.push(addDays(from, i));
  return keys;
}

/** Friday and Saturday nights are the weekend rate for Fri/Sat stays. */
export function isWeekendNight(key) {
  const day = parseKey(key).getUTCDay();
  return day === 5 || day === 6;
}

export function formatDateID(key) {
  if (!isValidKey(key)) return key;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseKey(key));
}
