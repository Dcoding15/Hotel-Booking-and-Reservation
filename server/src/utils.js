export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Days are handled as UTC-midnight Dates; check-out is exclusive (you pay for nights).
export function parseDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, 'Dates must be YYYY-MM-DD');
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid date');
  return d;
}
export const ymd = (d) => d.toISOString().slice(0, 10);
export const todayUTC = () => parseDay(ymd(new Date()));
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
