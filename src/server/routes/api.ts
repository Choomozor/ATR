import { Hono, type Context } from 'hono';
import {
  classifyStage,
  headToHead,
  nameKey,
  predictSeries,
  unpackMatch,
  type Match,
  type PackedMatch,
  type TournamentDetail,
  type TournamentSummary,
} from '../../shared/atr';
import type {
  Aoe4WorldResponse,
  BoardResponse,
  ErrorResponse,
  FanFlairRequest,
  FanFlairResponse,
  H2HResponse,
  MeResponse,
  NationResponse,
  PlayerResponse,
  PredictRequest,
  PredictResponse,
  RecordsResponse,
  TopResponse,
  TournamentResponse,
  TournamentsResponse,
} from '../../shared/api';
import { context, reddit, settings } from '@devvit/web/server';
import { fanFlairText } from '../../shared/countries';
import { getAoe4WorldProfile } from '../core/aoe4world';
import { PREDICTOR_USERS } from '../core/config';
import {
  readBoard,
  readMatches,
  readNationStats,
  readRanks,
  readRecords,
  readTitles,
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

/** Checked on every request from the viewer's Reddit session; nothing about the viewer is stored. */
async function canPredict(): Promise<boolean> {
  try {
    const username = await reddit.getCurrentUsername();
    return Boolean(username && PREDICTOR_USERS.some((u) => u.toLowerCase() === username.toLowerCase()));
  } catch {
    return false;
  }
}

async function fanFlairAllowed(): Promise<boolean> {
  const value = await settings.get<boolean>('allowFanFlair');
  return value !== false;
}

api.get('/me', async (c) => {
  const [predictor, username, allowed] = await Promise.all([
    canPredict(),
    reddit.getCurrentUsername().catch(() => undefined),
    fanFlairAllowed(),
  ]);
  return c.json<MeResponse>({ predictor, fanFlair: Boolean(username) && allowed });
});

/**
 * Sets (or removes, with player = null) the viewer's "<player> fan" user flair.
 * Nothing is stored by the app: the flair lives on Reddit like any other user flair.
 */
api.post('/fan-flair', async (c) => {
  const body = await c.req.json<FanFlairRequest>().catch(() => null);
  const username = await reddit.getCurrentUsername().catch(() => undefined);
  const subredditName = context.subredditName;
  if (!username || !subredditName) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Log in to Reddit to set a flair' }, 401);
  }
  if (!(await fanFlairAllowed())) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Fan flairs are turned off in this community' }, 403);
  }
  if (!body?.player) {
    await reddit.removeUserFlair(subredditName, username);
    return c.json<FanFlairResponse>({ flair: null });
  }
  const board = await readBoard();
  const row = board?.rows.find((r) => nameKey(r.name) === nameKey(String(body.player)));
  if (!row) return c.json<ErrorResponse>({ status: 'error', message: 'Unknown player' }, 404);
  const text = fanFlairText(row.name, row.country);
  await reddit.setUserFlair({ subredditName, username, text, backgroundColor: '#d97706', textColor: 'light' });
  return c.json<FanFlairResponse>({ flair: text });
});

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

api.get('/records', async (c) => {
  const [board, raw] = await Promise.all([readBoard(), readRecords()]);
  if (!board || !raw) return notSynced(c);
  return c.json<RecordsResponse>({ sheetDate: board.sheetDate, records: JSON.parse(raw) as RecordsResponse['records'] });
});

/** Series win chance between every pair of the given players (up to 32), for the bracket predictor. */
api.post('/predict', async (c) => {
  if (!(await canPredict())) return c.json<ErrorResponse>({ status: 'error', message: 'Not available' }, 403);
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
  const [board, raw, top10, allTitles, ranks] = await Promise.all([
    readBoard(),
    readMatches(nameKey(name)),
    readTop10(),
    readTitles(),
    readRanks(nameKey(name)),
  ]);
  const row = board?.rows.find((r) => nameKey(r.name) === nameKey(name)) ?? null;
  const matches = raw ? (JSON.parse(raw) as PackedMatch[]) : [];
  if (!row && matches.length === 0) {
    return c.json<ErrorResponse>({ status: 'error', message: `No player called "${name}" in the ATR` }, 404);
  }
  const titles = allTitles.filter((t) => nameKey(t.champion) === nameKey(name));
  return c.json<PlayerResponse>({ row, name: row?.name ?? name, matches, top10, titles, ranks });
});

api.get('/nation', async (c) => {
  const country = (c.req.query('country') ?? '').trim();
  const board = await readBoard();
  if (!board) return notSynced(c);
  const players = board.rows
    .filter((r) => r.country.toLowerCase() === country.toLowerCase())
    .sort((a, b) => Number(b.active) - Number(a.active) || b.elo - a.elo);
  if (!country || players.length === 0) {
    return c.json<ErrorResponse>({ status: 'error', message: `No ATR player from "${country}"` }, 404);
  }
  const name = players[0]!.country;
  const keys = new Set(players.map((p) => nameKey(p.name)));
  const [stats, titles] = await Promise.all([readNationStats(name), readTitles()]);
  return c.json<NationResponse>({
    country: name,
    players,
    stats,
    titles: titles.filter((t) => keys.has(nameKey(t.champion))),
  });
});

api.get('/tournaments', async (c) => {
  const raw = await readTournamentList();
  if (!raw) return notSynced(c);
  return c.json<TournamentsResponse>({ tournaments: JSON.parse(raw) as TournamentSummary[] });
});

api.get('/tournament', async (c) => {
  const name = c.req.query('name') ?? '';
  const [raw, titles] = await Promise.all([name ? readTournament(name) : null, readTitles()]);
  if (!raw) return c.json<ErrorResponse>({ status: 'error', message: `No tournament called "${name}" in the ATR` }, 404);
  const event = classifyStage(name).event;
  const title = titles.find((t) => t.stage === name) ?? titles.find((t) => t.event === event) ?? null;
  return c.json<TournamentResponse>({ ...(JSON.parse(raw) as TournamentDetail), title });
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
