// The server stores money amounts as integer paise.
const CURRENCY = 'INR';
export const money = (paise) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY }).format((paise || 0) / 100);

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const nightsBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
export const daysUntil = (iso) => {
  const checkIn = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((checkIn - today) / 86400000);
};
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const errMsg = (e) => e?.response?.data?.error || 'Something went wrong. Try again.';
