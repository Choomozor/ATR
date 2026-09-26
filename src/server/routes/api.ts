import { Hono, type Context } from 'hono';
import {
  headToHead,
  nameKey,
  predictSeries,
  updateMovers,
  unpackMatch,
  type Match,
  type PackedMatch,
  type TournamentSummary,
} from '../../shared/atr';
import type {
  Aoe4WorldResponse,
  BoardResponse,
  ErrorResponse,
  H2HResponse,
  PlayerResponse,
  PredictRequest,
  PredictResponse,
  RecordsResponse,
  TopResponse,
  TournamentResponse,
  TournamentsResponse,
} from '../../shared/api';
import { getAoe4WorldProfile } from '../core/aoe4world';
import {
  readBoard,
  readMatches,
  readRecords,
  readSyncStatus,
  readTop10,
  readTournament,
  readTournamentList,
} from '../core/sync';

export const api = new Hono();

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
    movers: updateMovers(board.rows),
  });
});

api.get('/records', async (c) => {
  const [board, raw] = await Promise.all([readBoard(), readRecords()]);
  if (!board || !raw) return notSynced(c);
  return c.json<RecordsResponse>({ sheetDate: board.sheetDate, records: JSON.parse(raw) as RecordsResponse['records'] });
});

/** Series win chance between every pair of the given players (up to 32), for the bracket predictor. */
api.post('/predict', async (c) => {
  const body = await c.req.json<PredictRequest>().catch(() => null);
  const names = [...new Set((body?.names ?? []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 32);
  if (names.length < 2) return c.json<ErrorResponse>({ status: 'error', message: 'Pick at least 2 players' }, 400);
  const board = await readBoard();
  if (!board) return notSynced(c);
  const byKey = new Map(board.rows.map((r) => [nameKey(r.name), r]));
  const rows = names.map((n) => byKey.get(nameKey(n)));
  const unknown = names.filter((_, i) => !rows[i]);
  const known = rows.filter((r): r is NonNullable<typeof r> => r !== undefined);
  const histories = await Promise.all(known.map((r) => loadMatches(r.name)));
  const today = new Date().toISOString().slice(0, 10);
  const matrix = known.map((a, i) =>
    known.map((b, j) => {
      if (i === j) return 0.5;
      const games = histories[i]!.filter((m) => nameKey(m.opponent) === nameKey(b.name));
      return predictSeries(a.elo, b.elo, games, today).probability;
    })
  );
  return c.json<PredictResponse>({
    players: known.map((r) => ({ name: r.name, elo: r.elo, country: r.country, rank: r.rank })),
    matrix,
    unknown,
  });
});

api.get('/player', async (c) => {
  const name = (c.req.query('name') ?? '').trim();
  if (!name) return c.json<ErrorResponse>({ status: 'error', message: 'name is required' }, 400);
  const [board, raw, top10] = await Promise.all([readBoard(), readMatches(nameKey(name)), readTop10()]);
  const row = board?.rows.find((r) => nameKey(r.name) === nameKey(name)) ?? null;
  const matches = raw ? (JSON.parse(raw) as PackedMatch[]) : [];
  if (!row && matches.length === 0) {
    return c.json<ErrorResponse>({ status: 'error', message: `No player called "${name}" in the ATR` }, 404);
  }
  return c.json<PlayerResponse>({ row, name: row?.name ?? name, matches, top10 });
});

api.get('/tournaments', async (c) => {
  const raw = await readTournamentList();
  if (!raw) return notSynced(c);
  return c.json<TournamentsResponse>({ tournaments: JSON.parse(raw) as TournamentSummary[] });
});

api.get('/tournament', async (c) => {
  const name = c.req.query('name') ?? '';
  const raw = name ? await readTournament(name) : null;
  if (!raw) return c.json<ErrorResponse>({ status: 'error', message: `No tournament called "${name}" in the ATR` }, 404);
  return c.json<TournamentResponse>(JSON.parse(raw) as TournamentResponse);
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
