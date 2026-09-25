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
