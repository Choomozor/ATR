export const pct = (rate: number | null | undefined): string =>
  rate === null || rate === undefined ? '–' : `${Math.round(rate * 100)}%`;

export const signed = (n: number, digits = 0): string => {
  const v = digits ? n.toFixed(digits) : String(Math.round(n));
  return n > 0 ? `+${v}` : v;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-20" -> "20 Sep 2026" (no locale surprises inside the Reddit webview). */
export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y}`;
};

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body: unknown = await res.json();
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

/** Hand-off from the feed card to the full view: which player page to open first. */
export const OPEN_PLAYER_KEY = 'atr:open-player';

export const takeOpenPlayer = (): string | null => {
  try {
    const name = localStorage.getItem(OPEN_PLAYER_KEY);
    localStorage.removeItem(OPEN_PLAYER_KEY);
    return name;
  } catch {
    return null;
  }
};

/** Green above 50%, red below, default ink at exactly 50% or with no decided series. */
export const rateTone = (rate: number | null | undefined): string =>
  rate === null || rate === undefined || Math.round(rate * 1000) === 500
    ? ''
    : rate > 0.5
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
