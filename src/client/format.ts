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

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

/** A page of the full view that can be opened from the feed card or from a shared link. */
export type Page =
  | { kind: 'player'; name: string }
  | { kind: 'tournament'; name: string }
  | { kind: 'compare'; a: string; b: string };

const isName = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 100;

/** Validates a page read from storage or from a shared link (both can be tampered with). */
export function toPage(value: unknown): Page | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  if ((value.kind === 'player' || value.kind === 'tournament') && 'name' in value && isName(value.name)) {
    return { kind: value.kind, name: value.name };
  }
  if (value.kind === 'compare' && 'a' in value && 'b' in value && isName(value.a) && isName(value.b)) {
    return { kind: 'compare', a: value.a, b: value.b };
  }
  return null;
}

export const parsePage = (raw: string | null | undefined): Page | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return toPage(parsed);
  } catch {
    // Older feed cards stored a bare player name.
    return isName(raw) ? { kind: 'player', name: raw } : null;
  }
};

export const pageTitle = (page: Page): string =>
  page.kind === 'compare' ? `${page.a} vs ${page.b}` : page.name;

/** Hand-off from the feed card to the full view: which page to open first. */
export const OPEN_PAGE_KEY = 'atr:open-page';

export const handOffPage = (page: Page | null): void => {
  try {
    if (page) localStorage.setItem(OPEN_PAGE_KEY, JSON.stringify(page));
    else localStorage.removeItem(OPEN_PAGE_KEY);
  } catch {
    // Storage can be unavailable; the full view then opens on the ranking.
  }
};

export const takeOpenPage = (): Page | null => {
  try {
    const raw = localStorage.getItem(OPEN_PAGE_KEY);
    localStorage.removeItem(OPEN_PAGE_KEY);
    return parsePage(raw);
  } catch {
    return null;
  }
};

/** "abbasid_dynasty" -> "Abbasid Dynasty", with AoE4World's few irregular ids spelled out. */
const CIV_NAMES: Record<string, string> = {
  zhu_xis_legacy: "Zhu Xi's Legacy",
  jeanne_darc: "Jeanne d'Arc",
  order_of_the_dragon: 'Order of the Dragon',
  house_of_lancaster: 'House of Lancaster',
  holy_roman_empire: 'Holy Roman Empire',
};

export const civName = (id: string): string =>
  CIV_NAMES[id] ??
  id
    .split('_')
    .map((w) => (w === 'of' || w === 'the' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/** Green above 50%, red below, default ink at exactly 50% or with no decided series. */
export const rateTone = (rate: number | null | undefined): string =>
  rate === null || rate === undefined || Math.round(rate * 1000) === 500
    ? ''
    : rate > 0.5
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
