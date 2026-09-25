// Parsing and statistics for the ATR (AoE4 Esports Tournament Ranking) sheet.
// Pure functions only: this file is shared by the server, the client and the tests.

export type BoardRow = {
  name: string;
  /** Rank among active players, as shown in the sheet. null when inactive. */
  rank: number | null;
  elo: number;
  active: boolean;
  /** Rank movement since the previous ATR update (positive = climbed). */
  rankChange: number;
  /** Elo movement since the previous ATR update. */
  eloChange: number;
  /** Last tournament match, YYYY-MM-DD. */
  lastPlayed: string;
  country: string;
  subRegion: string;
  region: string;
  /** All-time series record from TRDB. */
  wins: number;
  losses: number;
};

export type MatchResult = 'W' | 'L' | 'D';

export type Match = {
  date: string;
  tournament: string;
  opponent: string;
  score: number;
  opponentScore: number;
  result: MatchResult;
  tier: string;
  ratingAfter: number;
  ratingChange: number;
};

export type WinLoss = { wins: number; losses: number; draws: number; winRate: number | null };
export type MapRecord = { won: number; lost: number; winRate: number | null };

export type PlayerStats = {
  series: WinLoss;
  maps: MapRecord;
  last12Months: WinLoss;
  byTier: { tier: string; wins: number; losses: number; winRate: number | null }[];
  vsTop10: WinLoss | null;
  peak: { rating: number; date: string } | null;
  streak: { result: 'W' | 'L'; count: number } | null;
  tournaments: number;
  firstMatch: string | null;
  lastMatch: string | null;
  rivals: { name: string; wins: number; losses: number; draws: number }[];
  recent: Match[];
};

export type HeadToHead = {
  player: string;
  opponent: string;
  series: WinLoss;
  maps: MapRecord;
  matches: Match[];
};

// ---------------------------------------------------------------- CSV

/** RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- helpers

export const nameKey = (name: string): string => name.trim().toLowerCase();

const num = (value: string | undefined): number => {
  const n = Number.parseFloat((value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Google Sheets serial day number (days since 1899-12-30) to YYYY-MM-DD. */
export function serialToDate(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1000) return '';
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

const winRate = (wins: number, losses: number): number | null =>
  wins + losses === 0 ? null : wins / (wins + losses);

const emptyRecord = (): WinLoss => ({ wins: 0, losses: 0, draws: 0, winRate: null });

const addResult = (rec: WinLoss, result: MatchResult): void => {
  if (result === 'W') rec.wins++;
  else if (result === 'L') rec.losses++;
  else rec.draws++;
  rec.winRate = winRate(rec.wins, rec.losses);
};

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Tournament ELO tab

export type EloSheet = { sheetDate: string; rows: Omit<BoardRow, 'wins' | 'losses'>[] };

/**
 * Tournament ELO tab layout (0-based columns):
 *  0 row #, 1 rank among active players, 2 player, 3 Elo (after inactivity decay),
 *  4 last match (serial date), 5 "FALSE" when active / empty when inactive,
 *  8 Elo at previous update, 9 previous rank, 10 inactivity decay, 11 days since last match,
 *  14 rank change, 15 Elo change, 16 nationality, 17 sub-region, 18 region.
 * The first rows are titles; the update date sits in the first row.
 */
export function parseEloSheet(rows: string[][]): EloSheet {
  let sheetDate = '';
  for (const cell of rows[0] ?? []) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cell.trim());
    if (m) {
      sheetDate = `${m[3]}-${m[2]}-${m[1]}`;
      break;
    }
  }

  const out: EloSheet['rows'] = [];
  for (const r of rows) {
    const name = (r[2] ?? '').trim();
    const rowNumber = Number.parseInt(r[0] ?? '', 10);
    if (!name || !Number.isFinite(rowNumber) || name === 'Player') continue;
    const flag = (r[5] ?? '').trim().toUpperCase();
    const active = flag === 'FALSE';
    out.push({
      name,
      rank: active ? Number.parseInt(r[1] ?? '', 10) || null : null,
      elo: round1(num(r[3])),
      active,
      rankChange: Math.round(num(r[14])),
      eloChange: round1(num(r[15])),
      lastPlayed: serialToDate(num(r[4])),
      country: (r[16] ?? '').trim(),
      subRegion: (r[17] ?? '').trim(),
      region: (r[18] ?? '').trim(),
    });
  }
  out.sort((a, b) => b.elo - a.elo);
  return { sheetDate, rows: out };
}

// ---------------------------------------------------------------- TRDB tab

/**
 * TRDB has one row per player per series, from each player's point of view
 * ("Target"), in chronological order. Columns are found by header name.
 */
export function parseTrdb(rows: string[][]): Map<string, Match[]> {
  const byPlayer = new Map<string, Match[]>();
  const header = rows[0] ?? [];
  const col = (label: string): number => header.findIndex((h) => h.trim().toLowerCase() === label);
  const idx = {
    date: col('date'),
    tournament: col('tournament'),
    target: col('target'),
    opponent: col('opponent'),
    score: col('target score'),
    opponentScore: col('opponent score'),
    winner: col('winner'),
    tier: col('tier'),
    ratingAfter: col('new tr rating'),
    ratingChange: col('rating change'),
  };
  if (idx.target < 0 || idx.opponent < 0 || idx.date < 0) {
    throw new Error('TRDB header not recognised (expected Date, Target, Opponent… columns)');
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const target = (r[idx.target] ?? '').trim();
    const opponent = (r[idx.opponent] ?? '').trim();
    const date = (r[idx.date] ?? '').trim();
    if (!target || !opponent || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const winner = (r[idx.winner] ?? '').trim();
    const match: Match = {
      date,
      tournament: (r[idx.tournament] ?? '').trim(),
      opponent,
      score: num(r[idx.score]),
      opponentScore: num(r[idx.opponentScore]),
      result: winner === '1' ? 'W' : winner === '0' ? 'L' : 'D',
      tier: (r[idx.tier] ?? '').trim(),
      ratingAfter: round1(num(r[idx.ratingAfter])),
      ratingChange: round1(num(r[idx.ratingChange])),
    };
    const key = nameKey(target);
    const list = byPlayer.get(key);
    if (list) list.push(match);
    else byPlayer.set(key, [match]);
  }
  return byPlayer;
}

// Compact storage format (arrays are ~40% smaller than objects in Redis).
export type PackedMatch = [string, string, string, number, number, MatchResult, string, number, number];

export const packMatch = (m: Match): PackedMatch => [
  m.date,
  m.tournament,
  m.opponent,
  m.score,
  m.opponentScore,
  m.result,
  m.tier,
  m.ratingAfter,
  m.ratingChange,
];

export const unpackMatch = (p: PackedMatch): Match => ({
  date: p[0],
  tournament: p[1],
  opponent: p[2],
  score: p[3],
  opponentScore: p[4],
  result: p[5],
  tier: p[6],
  ratingAfter: p[7],
  ratingChange: p[8],
});

// ---------------------------------------------------------------- board

export function buildBoard(elo: EloSheet, matches: Map<string, Match[]>): BoardRow[] {
  return elo.rows.map((row) => {
    let wins = 0;
    let losses = 0;
    for (const m of matches.get(nameKey(row.name)) ?? []) {
      if (m.result === 'W') wins++;
      else if (m.result === 'L') losses++;
    }
    return { ...row, wins, losses };
  });
}

// ---------------------------------------------------------------- stats

const TIERS = ['S-Tier', 'A-Tier', 'B-Tier', 'C-Tier'];

export function computeStats(
  matches: Match[],
  opts: { today: string; top10?: string[]; recentCount?: number }
): PlayerStats {
  const series = emptyRecord();
  const last12Months = emptyRecord();
  const maps: MapRecord = { won: 0, lost: 0, winRate: null };
  const tiers = new Map<string, { wins: number; losses: number }>();
  const rivals = new Map<string, { name: string; wins: number; losses: number; draws: number }>();
  const tournaments = new Set<string>();
  const top10 = opts.top10 ? new Set(opts.top10.map(nameKey)) : null;
  const vsTop10 = top10 ? emptyRecord() : null;
  const since = addDays(opts.today, -365);
  let peak: PlayerStats['peak'] = null;

  for (const m of matches) {
    addResult(series, m.result);
    if (m.date >= since) addResult(last12Months, m.result);
    maps.won += m.score;
    maps.lost += m.opponentScore;
    tournaments.add(m.tournament);

    const t = tiers.get(m.tier) ?? { wins: 0, losses: 0 };
    if (m.result === 'W') t.wins++;
    if (m.result === 'L') t.losses++;
    tiers.set(m.tier, t);

    const rk = nameKey(m.opponent);
    const rival = rivals.get(rk) ?? { name: m.opponent, wins: 0, losses: 0, draws: 0 };
    if (m.result === 'W') rival.wins++;
    else if (m.result === 'L') rival.losses++;
    else rival.draws++;
    rivals.set(rk, rival);

    if (vsTop10 && top10?.has(rk)) addResult(vsTop10, m.result);
    if (m.ratingAfter > 0 && (!peak || m.ratingAfter > peak.rating)) {
      peak = { rating: m.ratingAfter, date: m.date };
    }
  }
  maps.winRate = winRate(maps.won, maps.lost);

  let streak: PlayerStats['streak'] = null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const r = matches[i]!.result;
    if (r === 'D') break;
    if (!streak) streak = { result: r, count: 1 };
    else if (streak.result === r) streak.count++;
    else break;
  }

  const byTier = [...tiers.entries()]
    .filter(([tier]) => TIERS.includes(tier))
    .sort((a, b) => TIERS.indexOf(a[0]) - TIERS.indexOf(b[0]))
    .map(([tier, r]) => ({ tier, ...r, winRate: winRate(r.wins, r.losses) }));

  const rivalList = [...rivals.values()]
    .sort((a, b) => b.wins + b.losses + b.draws - (a.wins + a.losses + a.draws))
    .slice(0, 5);

  return {
    series,
    maps,
    last12Months,
    byTier,
    vsTop10,
    peak,
    streak,
    tournaments: tournaments.size,
    firstMatch: matches[0]?.date ?? null,
    lastMatch: matches[matches.length - 1]?.date ?? null,
    rivals: rivalList,
    recent: matches.slice(-(opts.recentCount ?? 10)).reverse(),
  };
}

export function headToHead(player: string, matches: Match[], opponent: string): HeadToHead {
  const key = nameKey(opponent);
  const series = emptyRecord();
  const maps: MapRecord = { won: 0, lost: 0, winRate: null };
  const games = matches.filter((m) => nameKey(m.opponent) === key);
  for (const m of games) {
    addResult(series, m.result);
    maps.won += m.score;
    maps.lost += m.opponentScore;
  }
  maps.winRate = winRate(maps.won, maps.lost);
  return { player, opponent: games[0]?.opponent ?? opponent, series, maps, matches: games.slice().reverse() };
}

// ---------------------------------------------------------------- AoE4World matching

export type Aoe4WorldPlayer = {
  name: string;
  profile_id: number;
  social?: { liquipedia?: string } | null;
  leaderboards?: {
    rm_solo?: { rating?: number; rank?: number; rank_level?: string; games_count?: number } | null;
  } | null;
};

const simplify = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** "M8.MarineLorD" -> "MarineLorD", "[GL] Beasty" -> "Beasty", "Tag | Name" -> "Name". */
const stripTag = (s: string): string => s.split(/[.|\]]/).pop()!.trim();

/**
 * AoE4World search is fuzzy and pro players often carry team tags, so pick the result
 * whose name (without tag) matches the ATR name, preferring profiles linked to Liquipedia.
 */
export function pickAoe4WorldProfile<T extends Aoe4WorldPlayer>(players: T[], atrName: string): T | null {
  const target = simplify(atrName);
  if (!target) return null;
  let best: { p: T; score: number } | null = null;
  for (const p of players) {
    const full = simplify(p.name);
    const bare = simplify(stripTag(p.name));
    let score = 0;
    if (bare === target) score = 100;
    else if (full === target) score = 95;
    else continue;
    if (p.social?.liquipedia) score += 30;
    const solo = p.leaderboards?.rm_solo;
    if (solo?.rating) score += Math.min(solo.rating, 3000) / 1000;
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}
