// Builds the public ATR API: static JSON files computed with the same code as the Reddit app.
// The GitHub workflow on the main branch runs it every 3 hours and publishes the files on
// GitHub Pages, next to the website.
//
// Usage:
//   node --experimental-strip-types scripts/build-api.ts <output dir>
//   node --experimental-strip-types scripts/build-api.ts <output dir> <elo.csv> <trdb.csv>   (offline)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBoard,
  buildTournaments,
  computeNationStats,
  computeRecords,
  computeStats,
  findTitles,
  nameKey,
  nationRanking,
  parseCsv,
  parseEloSheet,
  parseTrdb,
  rankHistories,
  ratingHistory,
  summarize,
} from '../src/shared/atr.ts';

const SHEET_ID = '12CKvt3uO1NWBL3DsBN0adcynPUcuOIpCkobvgtymJq8';
const TABS = { elo: '🏆 Tournament ELO', trdb: '🗄️TRDB' };
const VERSION = 1;

const [outDir, eloFile, trdbFile] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: build-api.ts <output dir> [elo.csv trdb.csv]');

async function download(tab: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for tab "${tab}"`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`Tab "${tab}" came back as a web page. Is the sheet public?`);
  return text;
}

const [eloCsv, trdbCsv] =
  eloFile && trdbFile
    ? [readFileSync(eloFile, 'utf8'), readFileSync(trdbFile, 'utf8')]
    : await Promise.all([download(TABS.elo), download(TABS.trdb)]);

const elo = parseEloSheet(parseCsv(eloCsv));
const trdbRows = parseCsv(trdbCsv);
const matches = parseTrdb(trdbRows);
if (elo.rows.length < 100 || matches.size < 100) throw new Error('The sheet looks empty or truncated: nothing published.');

const generatedAt = new Date().toISOString();
const today = elo.sheetDate || generatedAt.slice(0, 10);
const rows = buildBoard(elo, matches);

const playerNames = new Map<string, string>();
for (const r of rows) playerNames.set(nameKey(r.name), r.name);
for (const list of matches.values()) {
  for (const m of list) if (!playerNames.has(nameKey(m.opponent))) playerNames.set(nameKey(m.opponent), m.opponent);
}

// URL-safe file names, stable and unique.
const used = new Set<string>();
function slugFor(name: string, prefix: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') ||
    `${prefix}-${[...name].reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0, 7).toString(36)}`;
  let slug = base;
  for (let i = 2; used.has(`${prefix}/${slug}`); i++) slug = `${base}-${i}`;
  used.add(`${prefix}/${slug}`);
  return slug;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'players'), { recursive: true });
mkdirSync(join(outDir, 'tournaments'), { recursive: true });
const write = (file: string, data: unknown): void => writeFileSync(join(outDir, file), JSON.stringify(data));

const source = {
  ranking: 'AoE4 Esports Tournament Ranking (ATR), maintained by the ATR team',
  sheet: `https://docs.google.com/spreadsheets/d/${SHEET_ID}`,
};
// generatedAt only goes in meta.json, so the other files change only when the sheet does.
const meta = { version: VERSION, sheetDate: elo.sheetDate, source };

const top10 = rows.filter((r) => r.active).slice(0, 10).map((r) => r.name);
const titles = findTitles(trdbRows, playerNames);
const ranks = rankHistories(matches, rows, today);
const tournaments = buildTournaments(matches, playerNames);

// Players: one file each, plus an index.
const playerIndex: { name: string; slug: string; rank: number | null; elo: number; country: string }[] = [];
for (const row of rows) {
  const key = nameKey(row.name);
  const list = matches.get(key) ?? [];
  const slug = slugFor(row.name, 'players');
  playerIndex.push({ name: row.name, slug, rank: row.rank, elo: row.elo, country: row.country });
  write(`players/${slug}.json`, {
    ...meta,
    player: row,
    stats: computeStats(list, { today, top10, recentCount: 10 }),
    titles: titles.filter((t) => nameKey(t.champion) === key),
    eloHistory: ratingHistory(list),
    rankHistory: ranks.get(key) ?? [],
    series: list,
  });
}

// Tournaments: one file each, plus an index (newest first).
const tournamentIndex = [...tournaments.values()]
  .map((t) => ({ ...summarize(t), slug: slugFor(t.name, 'tournaments') }))
  .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));
for (const t of tournamentIndex) {
  const detail = tournaments.get(t.name);
  const title = titles.find((x) => x.stage === t.name) ?? null;
  write(`tournaments/${t.slug}.json`, { ...meta, tournament: detail, title });
}

const nationStats = computeNationStats(matches, rows, titles);
const nations = nationRanking(rows, 3).map((n, i) => {
  const s = nationStats.get(n.country);
  return {
    rank: i + 1,
    country: n.country,
    score: n.score,
    activePlayers: n.activePlayers,
    top: n.top.map((p) => p.name),
    wins: s?.wins ?? 0,
    losses: s?.losses ?? 0,
    vs: s?.vs ?? [],
  };
});

write('ranking.json', { ...meta, players: rows });
write('players.json', { ...meta, players: playerIndex });
write('tournaments.json', { ...meta, tournaments: tournamentIndex });
write('titles.json', { ...meta, titles });
write('records.json', { ...meta, records: computeRecords(matches, playerNames, rows, today, titles) });
write('nations.json', { ...meta, nations });
write('meta.json', {
  ...meta,
  generatedAt,
  players: rows.length,
  activePlayers: rows.filter((r) => r.active).length,
  series: Math.round([...matches.values()].reduce((n, l) => n + l.length, 0) / 2),
  tournaments: tournamentIndex.length,
  winChance: 'P(A beats B) = 1 / (1 + 10 ^ ((eloB - eloA) / 400))',
});

writeFileSync(join(outDir, 'index.html'), docsPage());

function docsPage(): string {
  const ex = playerIndex[0]?.slug ?? 'marinelord';
  const t = tournamentIndex[0]?.slug ?? '';
  const rows = [
    ['meta.json', 'Sheet date, time of the last build, totals, win chance formula.'],
    ['ranking.json', 'Full Tournament Elo ranking: rank, Elo, changes since the last update, nation, region, record, last 10 results.'],
    ['players.json', 'Every player with the slug of their file.'],
    [`players/${ex}.json`, 'One player: ranking row, statistics, titles, Elo history, rank history, every series.'],
    ['tournaments.json', 'Every tournament, newest first, with the slug of its file.'],
    [`tournaments/${t}.json`, 'One tournament: every series, Elo gains and losses, champion.'],
    ['titles.json', 'Every title: event, stage, tier, date, champion, runner-up, final score.'],
    ['records.json', 'All-time records (titles, peak Elo, streaks, upsets, win rate, climbers, volume, rivalries).'],
    ['nations.json', 'Nations ranked by the average Elo of their 3 best active players, with their record against each other nation.'],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATR public API</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 16px;color:#1c1917;background:#fafaf9}
code{background:#f0eeec;padding:1px 4px;border-radius:4px}td{padding:6px 8px;border-top:1px solid #e7e5e4;vertical-align:top}table{border-collapse:collapse;width:100%}
@media (prefers-color-scheme:dark){body{background:#1c1917;color:#e7e5e4}code{background:#292524}td{border-color:#44403c}a{color:#fbbf24}}</style></head><body>
<h1>AoE4 Esports Tournament Ranking: public API</h1>
<p>Free JSON files with the ATR Tournament Elo ranking and the statistics shown in the r/aoe4 app, for streams, overlays, websites and bots.
Rebuilt every 3 hours from the <a href="${source.sheet}">ATR sheet</a>. Last sheet update: <b>${elo.sheetDate || 'unknown'}</b>.</p>
<p>Plain GET requests, no key, CORS open. Please credit "AoE4 Esports Tournament Ranking (ATR)" when you show the data.</p>
<table>${rows.map(([f, d]) => `<tr><td><a href="${f}"><code>${f}</code></a></td><td>${d}</td></tr>`).join('')}</table>
<p>Win chance of a series between two players: <code>1 / (1 + 10 ^ ((eloB - eloA) / 400))</code>.</p>
</body></html>`;
}

console.log(
  `API built in ${outDir}: ${playerIndex.length} players, ${tournamentIndex.length} tournaments, sheet date ${elo.sheetDate || 'unknown'}.`
);
