import { Hono, type Context } from 'hono';
import {
  computeStats,
  headToHead,
  nameKey,
  unpackMatch,
  type Match,
  type PackedMatch,
} from '../../shared/atr';
import type {
  Aoe4WorldResponse,
  BoardResponse,
  ErrorResponse,
  H2HResponse,
  PlayerResponse,
  TopResponse,
} from '../../shared/api';
import { getAoe4WorldProfile } from '../core/aoe4world';
import { readBoard, readMatches, readSyncStatus, readTop10 } from '../core/sync';

export const api = new Hono();

const today = (): string => new Date().toISOString().slice(0, 10);

const notSynced = (c: Context) =>
  c.json<ErrorResponse>({ status: 'error', message: 'The ranking has not been synced yet. A moderator can run "Sync ATR data now".' }, 503);

async function loadMatches(name: string): Promise<Match[]> {
  const raw = await readMatches(nameKey(name));
  if (!raw) return [];
  return (JSON.parse(raw) as PackedMatch[]).map(unpackMatch);
}

api.get('/board', async (c) => {
  const [board, lastSync] = await Promise.all([readBoard(), readSyncStatus()]);
  if (!board) return notSynced(c);
  return c.json<BoardResponse>({ ...board, lastSync });
});

api.get('/top', async (c) => {
  const board = await readBoard();
  if (!board) return notSynced(c);
  const n = Math.min(Number.parseInt(c.req.query('n') ?? '5', 10) || 5, 50);
  return c.json<TopResponse>({
    sheetDate: board.sheetDate,
    rows: board.rows.filter((r) => r.active).slice(0, n),
  });
});

api.get('/player', async (c) => {
  const name = (c.req.query('name') ?? '').trim();
  if (!name) return c.json<ErrorResponse>({ status: 'error', message: 'name is required' }, 400);
  const [board, matches, top10] = await Promise.all([readBoard(), loadMatches(name), readTop10()]);
  const row = board?.rows.find((r) => nameKey(r.name) === nameKey(name)) ?? null;
  if (!row && matches.length === 0) {
    return c.json<ErrorResponse>({ status: 'error', message: `No player called "${name}" in the ATR` }, 404);
  }
  const stats = computeStats(matches, {
    today: today(),
    top10: top10.filter((n) => nameKey(n) !== nameKey(name)),
  });
  return c.json<PlayerResponse>({ row, name: row?.name ?? name, stats });
});

api.get('/h2h', async (c) => {
  const a = (c.req.query('a') ?? '').trim();
  const b = (c.req.query('b') ?? '').trim();
  if (!a || !b) return c.json<ErrorResponse>({ status: 'error', message: 'a and b are required' }, 400);
  const matches = await loadMatches(a);
  return c.json<H2HResponse>(headToHead(a, matches, b));
});

api.get('/aoe4world', async (c) => {
  const name = (c.req.query('name') ?? '').trim();
  if (!name) return c.json<ErrorResponse>({ status: 'error', message: 'name is required' }, 400);
  try {
    return c.json<Aoe4WorldResponse>(await getAoe4WorldProfile(name));
  } catch (error) {
    console.error('AoE4World lookup failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'AoE4World is unavailable right now' }, 502);
  }
});
