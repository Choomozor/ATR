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
  /** Last 10 series results, oldest first ("WWLWD…"). */
  form: string;
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
  /** Both players' Tournament Elo before the series (0 when unknown). */
  ratingBefore: number;
  opponentRatingBefore: number;
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
  /** Longest run of series won in a row. */
  bestStreak: { count: number; from: string; to: string } | null;
  tournaments: number;
  firstMatch: string | null;
  lastMatch: string | null;
  rivals: { name: string; wins: number; losses: number; draws: number }[];
  /** Opponent with the worst record against (at least MIN_MATCHUP series). */
  nemesis: Matchup | null;
  /** Opponent with the best record against (at least MIN_MATCHUP series). */
  bestMatchup: Matchup | null;
  recent: Match[];
};

export type Matchup = { name: string; wins: number; losses: number; winRate: number };

/** Minimum number of decided series against an opponent before it counts as a nemesis or best matchup. */
export const MIN_MATCHUP = 3;

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

export type EloSheet = { sheetDate: string; rows: Omit<BoardRow, 'wins' | 'losses' | 'form'>[] };

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
    ratingBefore: col('target tr'),
    opponentRatingBefore: col('opponent tr'),
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
      ratingBefore: idx.ratingBefore < 0 ? 0 : round1(num(r[idx.ratingBefore])),
      opponentRatingBefore: idx.opponentRatingBefore < 0 ? 0 : round1(num(r[idx.opponentRatingBefore])),
    };
    const key = nameKey(target);
    const list = byPlayer.get(key);
    if (list) list.push(match);
    else byPlayer.set(key, [match]);
  }
  return byPlayer;
}

// Compact storage format (arrays are ~40% smaller than objects in Redis).
export type PackedMatch = [
  string,
  string,
  string,
  number,
  number,
  MatchResult,
  string,
  number,
  number,
  number,
  number,
];

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
  m.ratingBefore,
  m.opponentRatingBefore,
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
  ratingBefore: p[9] ?? 0,
  opponentRatingBefore: p[10] ?? 0,
});

// ---------------------------------------------------------------- board

export function buildBoard(elo: EloSheet, matches: Map<string, Match[]>): BoardRow[] {
  return elo.rows.map((row) => {
    let wins = 0;
    let losses = 0;
    const list = matches.get(nameKey(row.name)) ?? [];
    for (const m of list) {
      if (m.result === 'W') wins++;
      else if (m.result === 'L') losses++;
    }
    const form = list
      .slice(-10)
      .map((m) => m.result)
      .join('');
    return { ...row, wins, losses, form };
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

  const bestStreak = longestWinStreak(matches);

  const byTier = [...tiers.entries()]
    .filter(([tier]) => TIERS.includes(tier))
    .sort((a, b) => TIERS.indexOf(a[0]) - TIERS.indexOf(b[0]))
    .map(([tier, r]) => ({ tier, ...r, winRate: winRate(r.wins, r.losses) }));

  const matchups: Matchup[] = [...rivals.values()]
    .filter((r) => r.wins + r.losses >= MIN_MATCHUP)
    .map((r) => ({ name: r.name, wins: r.wins, losses: r.losses, winRate: r.wins / (r.wins + r.losses) }));
  // Nemesis: lowest win rate, then most losses. Best matchup: highest win rate, then most wins.
  const nemesis =
    [...matchups].filter((m) => m.losses > 0).sort((a, b) => a.winRate - b.winRate || b.losses - a.losses)[0] ?? null;
  const bestMatchup =
    [...matchups].filter((m) => m.wins > 0).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0] ?? null;

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
    bestStreak,
    tournaments: tournaments.size,
    firstMatch: matches[0]?.date ?? null,
    lastMatch: matches[matches.length - 1]?.date ?? null,
    rivals: rivalList,
    nemesis,
    bestMatchup,
    recent: matches.slice(-(opts.recentCount ?? 10)).reverse(),
  };
}

/** Longest run of consecutive series wins (a loss or a draw ends it). Matches oldest first. */
export function longestWinStreak(matches: Match[]): PlayerStats['bestStreak'] {
  let best: PlayerStats['bestStreak'] = null;
  let count = 0;
  let from = '';
  for (const m of matches) {
    if (m.result === 'W') {
      if (count === 0) from = m.date;
      count++;
      if (!best || count > best.count) best = { count, from, to: m.date };
    } else {
      count = 0;
    }
  }
  return best;
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
    if (bare !== target && full !== target) continue;
    let score = bare === target ? 100 : 95;
    if (p.social?.liquipedia) score += 30;
    const solo = p.leaderboards?.rm_solo;
    if (solo?.rating) score += Math.min(solo.rating, 3000) / 1000;
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

// ---------------------------------------------------------------- Elo history & predictions

export type RatingPoint = { date: string; rating: number; tournament: string };

/** One point per day (the rating after the last series that day), oldest first. */
export function ratingHistory(matches: Match[]): RatingPoint[] {
  const out: RatingPoint[] = [];
  for (const m of matches) {
    if (!(m.ratingAfter > 0)) continue;
    const last = out[out.length - 1];
    const point = { date: m.date, rating: m.ratingAfter, tournament: m.tournament };
    if (last && last.date === m.date) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/** Standard Elo expectation: the chance that a player rated `a` beats one rated `b`. */
export const winProbability = (a: number, b: number): number => 1 / (1 + Math.pow(10, (b - a) / 400));

export const filterByPeriod = (matches: Match[], from: string | null): Match[] =>
  from ? matches.filter((m) => m.date >= from) : matches;

// ---------------------------------------------------------------- tournaments

export type TournamentSeries = {
  date: string;
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
  winner: 'a' | 'b' | 'draw';
  ratingA: number;
  ratingB: number;
  changeA: number;
  changeB: number;
};

export type TournamentSummary = {
  name: string;
  tier: string;
  start: string;
  end: string;
  series: number;
  players: number;
};

export type TournamentDetail = TournamentSummary & {
  /** Newest first. */
  matches: TournamentSeries[];
  /** Tournament Elo won or lost across the event, best first. */
  movers: { name: string; change: number; wins: number; losses: number }[];
};

/**
 * TRDB lists every series twice (once per player). Keep one row per series: the one seen from
 * the player whose name sorts first, and pair it with the mirror row for the opponent's numbers.
 */
export function buildTournaments(byPlayer: Map<string, Match[]>, playerNames: Map<string, string>): Map<string, TournamentDetail> {
  const events = new Map<string, TournamentDetail & { names: Set<string>; moverMap: Map<string, TournamentDetail['movers'][number]> }>();
  for (const [key, list] of byPlayer) {
    const player = playerNames.get(key) ?? key;
    for (const m of list) {
      let ev = events.get(m.tournament);
      if (!ev) {
        ev = {
          name: m.tournament,
          tier: m.tier,
          start: m.date,
          end: m.date,
          series: 0,
          players: 0,
          matches: [],
          movers: [],
          names: new Set(),
          moverMap: new Map(),
        };
        events.set(m.tournament, ev);
      }
      if (m.date < ev.start) ev.start = m.date;
      if (m.date > ev.end) ev.end = m.date;
      ev.names.add(key);
      const mover = ev.moverMap.get(key) ?? { name: player, change: 0, wins: 0, losses: 0 };
      mover.change += m.ratingChange;
      if (m.result === 'W') mover.wins++;
      if (m.result === 'L') mover.losses++;
      ev.moverMap.set(key, mover);

      const oppKey = nameKey(m.opponent);
      if (key < oppKey || !byPlayer.has(oppKey)) {
        ev.matches.push({
          date: m.date,
          a: player,
          b: m.opponent,
          scoreA: m.score,
          scoreB: m.opponentScore,
          winner: m.result === 'W' ? 'a' : m.result === 'L' ? 'b' : 'draw',
          ratingA: m.ratingBefore,
          ratingB: m.opponentRatingBefore,
          changeA: m.ratingChange,
          changeB: -m.ratingChange,
        });
      }
    }
  }
  const out = new Map<string, TournamentDetail>();
  for (const ev of events.values()) {
    const { names, moverMap, ...rest } = ev;
    rest.matches.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    rest.series = rest.matches.length;
    rest.players = names.size;
    rest.movers = [...moverMap.values()]
      .map((mv) => ({ ...mv, change: Math.round(mv.change * 10) / 10 }))
      .sort((x, y) => y.change - x.change);
    out.set(rest.name, rest);
  }
  return out;
}

export const summarize = (t: TournamentDetail): TournamentSummary => ({
  name: t.name,
  tier: t.tier,
  start: t.start,
  end: t.end,
  series: t.series,
  players: t.players,
});

// ---------------------------------------------------------------- nations

export type Nation = {
  country: string;
  /** Average Tournament Elo of the nation's best `size` active players. */
  score: number;
  activePlayers: number;
  top: BoardRow[];
};

export function nationRanking(rows: BoardRow[], size = 3): Nation[] {
  const byCountry = new Map<string, BoardRow[]>();
  for (const r of rows) {
    if (!r.active || !r.country) continue;
    const list = byCountry.get(r.country);
    if (list) list.push(r);
    else byCountry.set(r.country, [r]);
  }
  return [...byCountry.entries()]
    .map(([country, list]) => {
      const sorted = list.sort((a, b) => b.elo - a.elo);
      const top = sorted.slice(0, size);
      // Nations with fewer players than `size` count the missing slots as 1000 (the starting Elo).
      const total = top.reduce((sum, r) => sum + r.elo, 0) + 1000 * (size - top.length);
      return { country, score: Math.round(total / size), activePlayers: list.length, top: sorted.slice(0, 5) };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------- update digest

export type Upset = {
  date: string;
  tournament: string;
  winner: string;
  loser: string;
  winnerRating: number;
  loserRating: number;
  score: string;
};

/** Wins against a higher-rated opponent since `since` (exclusive), biggest rating gap first. */
export function findUpsets(byPlayer: Map<string, Match[]>, playerNames: Map<string, string>, since: string): Upset[] {
  const out: Upset[] = [];
  for (const [key, list] of byPlayer) {
    for (const m of list) {
      if (m.date <= since || m.result !== 'W' || !m.ratingBefore || !m.opponentRatingBefore) continue;
      if (m.opponentRatingBefore <= m.ratingBefore) continue;
      out.push({
        date: m.date,
        tournament: m.tournament,
        winner: playerNames.get(key) ?? key,
        loser: m.opponent,
        winnerRating: m.ratingBefore,
        loserRating: m.opponentRatingBefore,
        score: `${m.score}–${m.opponentScore}`,
      });
    }
  }
  return out.sort((a, b) => b.loserRating - b.winnerRating - (a.loserRating - a.winnerRating));
}

export type Digest = { sheetDate: string; title: string; text: string };

const fmtDate = (iso: string): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)} ${months[Number(m) - 1] ?? ''} ${y}` : iso;
};

const sign = (n: number): string => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);

/** Markdown summary of an ATR update, for the automatic subreddit post. */
export function buildDigest(rows: BoardRow[], sheetDate: string, upsets: Upset[], rankingPostUrl: string | null): Digest {
  const active = rows.filter((r) => r.active && r.rank !== null);
  const lines: string[] = [];
  lines.push(`The AoE4 Esports Tournament Ranking was updated on **${fmtDate(sheetDate)}**.`, '');

  lines.push('### Top 10', '', '| # | Player | Elo | Change |', '|--:|:--|--:|--:|');
  for (const r of active.slice(0, 10)) {
    const move = r.rankChange > 0 ? ` (▲${r.rankChange})` : r.rankChange < 0 ? ` (▼${-r.rankChange})` : '';
    lines.push(`| ${r.rank}${move} | ${r.name} | ${Math.round(r.elo)} | ${sign(r.eloChange)} |`);
  }

  const top100 = active.slice(0, 100);
  const risers = top100.filter((r) => r.eloChange > 0).sort((a, b) => b.eloChange - a.eloChange).slice(0, 5);
  const fallers = top100.filter((r) => r.eloChange < 0).sort((a, b) => a.eloChange - b.eloChange).slice(0, 5);
  if (risers.length) {
    lines.push('', '### Biggest risers (top 100)', '');
    for (const r of risers) lines.push(`- **${r.name}** ${sign(r.eloChange)} Elo, now #${r.rank}`);
  }
  if (fallers.length) {
    lines.push('', '### Biggest drops (top 100)', '');
    for (const r of fallers) lines.push(`- **${r.name}** ${sign(r.eloChange)} Elo, now #${r.rank}`);
  }

  const newTop32 = active.filter((r) => (r.rank ?? 99) <= 32 && (r.rank ?? 0) + r.rankChange > 32);
  if (newTop32.length) {
    lines.push('', '### New in the top 32', '');
    for (const r of newTop32) lines.push(`- **${r.name}** enters at #${r.rank} (▲${r.rankChange})`);
  }

  const upset = upsets[0];
  if (upset) {
    lines.push(
      '',
      '### Upset of the update',
      '',
      `**${upset.winner}** (${Math.round(upset.winnerRating)}) beat **${upset.loser}** (${Math.round(upset.loserRating)}) ${upset.score} in ${upset.tournament}.`
    );
  }

  lines.push('', '---', '');
  lines.push(
    rankingPostUrl
      ? `Full ranking, player stats and head-to-heads: [open the interactive ATR post](${rankingPostUrl}).`
      : 'Full ranking, player stats and head-to-heads are in the pinned ATR post.'
  );
  lines.push('', '^(Posted automatically by the ATR app from the public ATR sheet.)');

  return { sheetDate, title: `ATR Tournament Elo update: ${fmtDate(sheetDate)}`, text: lines.join('\n') };
}

// ---------------------------------------------------------------- series prediction

export type Prediction = {
  /** Chance that A wins a series against B. */
  probability: number;
  /** What the Elo difference alone says. */
  eloProbability: number;
  /** Head-to-head record weighted by recency (a series one half-life old counts half). */
  weightedWins: number;
  weightedLosses: number;
  /** How much the head-to-head moved the prediction away from Elo alone, in points of %. */
  h2hShift: number;
};

/** A series this many days old counts half as much as one played today. */
export const H2H_HALF_LIFE_DAYS = 365;
/** Weight of the Elo estimate, in "virtual series": with little or old head-to-head, Elo dominates. */
export const ELO_PRIOR_SERIES = 3;

/**
 * Elo expectation adjusted by the head-to-head: the recency-weighted record between the two
 * players is blended with the Elo estimate, which acts as ELO_PRIOR_SERIES virtual series.
 * `matches` are A's series against B (any order).
 */
export function predictSeries(eloA: number, eloB: number, matches: Match[], today: string): Prediction {
  const eloProbability = winProbability(eloA, eloB);
  const now = Date.parse(`${today}T00:00:00Z`);
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const ageDays = Math.max(0, (now - Date.parse(`${m.date}T00:00:00Z`)) / 86_400_000);
    const weight = Math.pow(0.5, ageDays / H2H_HALF_LIFE_DAYS);
    if (m.result === 'W') wins += weight;
    else if (m.result === 'L') losses += weight;
    else {
      wins += weight / 2;
      losses += weight / 2;
    }
  }
  const probability = (wins + ELO_PRIOR_SERIES * eloProbability) / (wins + losses + ELO_PRIOR_SERIES);
  return {
    probability,
    eloProbability,
    weightedWins: wins,
    weightedLosses: losses,
    h2hShift: Math.round((probability - eloProbability) * 100),
  };
}

// ---------------------------------------------------------------- movers (feed card)

export type Mover = { name: string; change: number; rank: number | null };

/** Biggest Elo moves of the last ATR update among the top `pool` active players. */
export function updateMovers(rows: BoardRow[], risers = 2, fallers = 1, pool = 100): Mover[] {
  const active = rows.filter((r) => r.active).slice(0, pool);
  const toMover = (r: BoardRow): Mover => ({ name: r.name, change: Math.round(r.eloChange), rank: r.rank });
  const up = active
    .filter((r) => Math.round(r.eloChange) > 0)
    .sort((a, b) => b.eloChange - a.eloChange)
    .slice(0, risers)
    .map(toMover);
  const down = active
    .filter((r) => Math.round(r.eloChange) < 0)
    .sort((a, b) => a.eloChange - b.eloChange)
    .slice(0, fallers)
    .map(toMover);
  return [...up, ...down];
}

// ---------------------------------------------------------------- records

export type RecordEntry = {
  name: string;
  /** Headline number, already formatted. */
  value: string;
  detail: string;
  /** Second player involved (the beaten favourite for upsets). */
  other?: string;
};

export type RecordList = { id: string; title: string; note: string; entries: RecordEntry[] };

/** Minimum decided series to appear in the best win rate list. */
export const RECORD_MIN_SERIES = 50;

const monthYear = (iso: string): string => fmtDate(iso).replace(/^\d+ /, '');

/** All-time records, computed once per sync. `today` is the sheet date. */
export function computeRecords(
  byPlayer: Map<string, Match[]>,
  playerNames: Map<string, string>,
  rows: BoardRow[],
  today: string,
  size = 10
): RecordList[] {
  const currentElo = new Map(rows.map((r) => [nameKey(r.name), r.elo]));
  const since = addDays(today, -365);
  const peaks: { name: string; rating: number; date: string; now: number | undefined }[] = [];
  const streaks: { name: string; count: number; from: string; to: string }[] = [];
  const volume: { name: string; series: number; wins: number; losses: number; tournaments: number }[] = [];
  const climbs: { name: string; change: number; series: number; now: number | undefined }[] = [];
  const upsets: { name: string; other: string; chance: number; m: Match }[] = [];

  for (const [key, list] of byPlayer) {
    const name = playerNames.get(key) ?? key;
    let peak: { rating: number; date: string } | null = null;
    let wins = 0;
    let losses = 0;
    let change = 0;
    let recent = 0;
    const events = new Set<string>();
    for (const m of list) {
      if (m.ratingAfter > 0 && (!peak || m.ratingAfter > peak.rating)) peak = { rating: m.ratingAfter, date: m.date };
      if (m.result === 'W') wins++;
      else if (m.result === 'L') losses++;
      events.add(m.tournament);
      if (m.date > since) {
        change += m.ratingChange;
        recent++;
      }
      if (m.result === 'W' && m.ratingBefore > 0 && m.opponentRatingBefore > 0) {
        const chance = winProbability(m.ratingBefore, m.opponentRatingBefore);
        if (chance < 0.5) upsets.push({ name, other: m.opponent, chance, m });
      }
    }
    if (peak) peaks.push({ name, ...peak, now: currentElo.get(key) });
    const streak = longestWinStreak(list);
    if (streak) streaks.push({ name, ...streak });
    volume.push({ name, series: list.length, wins, losses, tournaments: events.size });
    if (recent > 0) climbs.push({ name, change, series: recent, now: currentElo.get(key) });
  }

  const round = (n: number) => Math.round(n);
  const range = (from: string, to: string) => (from === to ? fmtDate(from) : `${monthYear(from)} – ${monthYear(to)}`);

  return [
    {
      id: 'peak',
      title: 'Highest peak Elo',
      note: 'Best Tournament Elo ever reached',
      entries: peaks
        .sort((a, b) => b.rating - a.rating)
        .slice(0, size)
        .map((p) => ({
          name: p.name,
          value: String(round(p.rating)),
          detail: `${monthYear(p.date)}${p.now ? ` · now ${round(p.now)}` : ''}`,
        })),
    },
    {
      id: 'streak',
      title: 'Longest win streaks',
      note: 'Series won in a row',
      entries: streaks
        .sort((a, b) => b.count - a.count || (a.to < b.to ? 1 : -1))
        .slice(0, size)
        .map((s) => ({ name: s.name, value: String(s.count), detail: range(s.from, s.to) })),
    },
    {
      id: 'upsets',
      title: 'Biggest upsets',
      note: 'Series won with the lowest Elo win chance',
      entries: upsets
        .sort((a, b) => a.chance - b.chance)
        .slice(0, size)
        .map((u) => ({
          name: u.name,
          other: u.other,
          value: `${Math.max(1, Math.round(u.chance * 100))}%`,
          detail: `${u.m.score}–${u.m.opponentScore} · ${u.m.tournament} · ${fmtDate(u.m.date)}`,
        })),
    },
    {
      id: 'winrate',
      title: 'Best series win rate',
      note: `At least ${RECORD_MIN_SERIES} series decided`,
      entries: volume
        .filter((v) => v.wins + v.losses >= RECORD_MIN_SERIES)
        .map((v) => ({ ...v, rate: v.wins / (v.wins + v.losses) }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, size)
        .map((v) => ({ name: v.name, value: `${Math.round(v.rate * 100)}%`, detail: `${v.wins}W – ${v.losses}L` })),
    },
    {
      id: 'climb',
      title: 'Biggest climbers',
      note: 'Tournament Elo won over the last 12 months',
      entries: climbs
        .filter((c) => c.change > 0)
        .sort((a, b) => b.change - a.change)
        .slice(0, size)
        .map((c) => ({
          name: c.name,
          value: `+${round(c.change)}`,
          detail: `${c.series} series${c.now ? ` · now ${round(c.now)}` : ''}`,
        })),
    },
    {
      id: 'volume',
      title: 'Most series played',
      note: 'All tournaments in the ATR',
      entries: volume
        .sort((a, b) => b.series - a.series)
        .slice(0, size)
        .map((v) => ({
          name: v.name,
          value: String(v.series),
          detail: `${v.wins}W – ${v.losses}L · ${v.tournaments} tournaments`,
        })),
    },
  ];
}

// ---------------------------------------------------------------- bracket predictor

/** Bracket positions for seeds 1..n (n a power of two): 1 v n, and 1 and 2 only meet in the final. */
export function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
}

export const bracketSize = (players: number): number => {
  let n = 2;
  while (n < players) n *= 2;
  return n;
};

/**
 * Single elimination odds. `slots` is the bracket from top to bottom (index into the player
 * list, or null for a bye); `p(i, j)` is the chance that player i beats player j in a series.
 * Returns, for each player, the chance to win each round (last entry = win the tournament).
 */
export function bracketOdds(slots: (number | null)[], players: number, p: (i: number, j: number) => number): number[][] {
  const out: number[][] = Array.from({ length: players }, () => []);
  let alive: number[] = slots.map((s) => (s === null ? 0 : 1));
  for (let block = 2; block <= slots.length; block *= 2) {
    const next = alive.map((mine, pos) => {
      const me = slots[pos];
      if (me === null || me === undefined || mine === 0) return 0;
      const start = Math.floor(pos / block) * block;
      const half = block / 2;
      const oppStart = pos - start < half ? start + half : start;
      let win = 0;
      let anyone = 0;
      for (let q = oppStart; q < oppStart + half; q++) {
        const opp = slots[q];
        const reach = alive[q] ?? 0;
        if (opp === null || opp === undefined || reach === 0) continue;
        anyone += reach;
        win += reach * p(me, opp);
      }
      // Nobody can be there (only byes): a walkover.
      return mine * (win + (1 - anyone));
    });
    next.forEach((v, pos) => {
      const me = slots[pos];
      if (me !== null && me !== undefined) out[me]!.push(v);
    });
    alive = next;
  }
  return out;
}

// ---------------------------------------------------------------- tournament highlights

export type SeriesHighlight = {
  winner: string;
  loser: string;
  score: string;
  date: string;
  /** Winner's Elo win chance before the series. */
  chance: number | null;
  /** Average Tournament Elo of the two players before the series. */
  averageElo: number | null;
};

export type TournamentHighlights = {
  /** Won with the lowest Elo win chance. */
  biggestUpset: SeriesHighlight | null;
  /** Highest average Elo of the two players. */
  clashOfTitans: SeriesHighlight | null;
  /** Most maps in one series. */
  longestSeries: SeriesHighlight | null;
  /** Most series won in the event. */
  bestRun: { name: string; wins: number; losses: number; change: number } | null;
  totalMaps: number;
  /** Series where the loser took no map. */
  sweeps: number;
  /** Series decided by a single map. */
  deciders: number;
  /** Share of series won by the higher-rated player (null when ratings are missing). */
  favouritesWon: number | null;
};

const toHighlight = (m: TournamentSeries): SeriesHighlight | null => {
  if (m.winner === 'draw') return null;
  const aWon = m.winner === 'a';
  const known = m.ratingA > 0 && m.ratingB > 0;
  return {
    winner: aWon ? m.a : m.b,
    loser: aWon ? m.b : m.a,
    score: aWon ? `${m.scoreA}–${m.scoreB}` : `${m.scoreB}–${m.scoreA}`,
    date: m.date,
    chance: known ? (aWon ? winProbability(m.ratingA, m.ratingB) : winProbability(m.ratingB, m.ratingA)) : null,
    averageElo: known ? (m.ratingA + m.ratingB) / 2 : null,
  };
};

export function tournamentHighlights(t: TournamentDetail): TournamentHighlights {
  const decided = t.matches.map(toHighlight).filter((h): h is SeriesHighlight => h !== null);
  const pick = (score: (h: SeriesHighlight) => number | null) => {
    let best: { h: SeriesHighlight; v: number } | null = null;
    for (const h of decided) {
      const v = score(h);
      if (v !== null && (!best || v > best.v)) best = { h, v };
    }
    return best?.h ?? null;
  };
  const maps = (h: SeriesHighlight) => h.score.split('–').reduce((sum, n) => sum + Number(n), 0);

  let totalMaps = 0;
  let sweeps = 0;
  let deciders = 0;
  let rated = 0;
  let favourites = 0;
  for (const m of t.matches) {
    totalMaps += m.scoreA + m.scoreB;
    if (m.winner !== 'draw' && Math.min(m.scoreA, m.scoreB) === 0 && Math.max(m.scoreA, m.scoreB) > 1) sweeps++;
    if (m.winner !== 'draw' && Math.abs(m.scoreA - m.scoreB) === 1 && m.scoreA + m.scoreB >= 3) deciders++;
    if (m.winner !== 'draw' && m.ratingA > 0 && m.ratingB > 0 && m.ratingA !== m.ratingB) {
      rated++;
      if ((m.winner === 'a') === m.ratingA > m.ratingB) favourites++;
    }
  }

  const upset = pick((h) => (h.chance === null || h.chance >= 0.5 ? null : 1 - h.chance));
  const longest = pick((h) => maps(h));
  const run = [...t.movers].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.change - a.change)[0];

  return {
    biggestUpset: upset,
    clashOfTitans: pick((h) => h.averageElo),
    longestSeries: longest && maps(longest) > 1 ? longest : null,
    bestRun: run && run.wins > 0 ? run : null,
    totalMaps,
    sweeps,
    deciders,
    favouritesWon: rated ? favourites / rated : null,
  };
}
