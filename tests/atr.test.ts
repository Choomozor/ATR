import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoard,
  computeStats,
  headToHead,
  parseCsv,
  parseEloSheet,
  parseTrdb,
  pickAoe4WorldProfile,
  packMatch,
  unpackMatch,
  serialToDate,
  ratingHistory,
  winProbability,
  buildTournaments,
  nationRanking,
  findUpsets,
  buildDigest,
  predictSeries,
} from '../src/shared/atr.ts';

// Real rows copied from the ATR sheet (Tournament ELO + TRDB), 2026-09-25.
const ELO = `"","","","","","","","","","","","","","","20/09/2026","","","",""
"","","Player","","","","","","","","","","","","","","","",""
"","","","","","","","","","","","","","","","","Nationality","Sub","Region"
"1","1","MarineLorD","2378.419566","46285","FALSE","25/09/2026","46290","2327.465875","1","0","5","2378.419566","2378.419566","0","50.95369051","France","WEU","EU"
"2","2","VortiX","2137.958277","46285","FALSE","","","2097.132959","4","0","5","2137.958277","2137.958277","2","40.82531783","Spain","SEU","EU"
"3","3","Puppypaw","2106.209756","46284","FALSE","","","2120.53431","2","0","6","2106.209756","2106.209756","-1","-14.32455436","Canada","NAM","AM"
"6","6","Anotand","2046.608267","46285","FALSE","","","2113.554048","3","0","5","2046.608267","2046.608267","-3","-66.94578072","Belarus","EEU","EU"
"14","13","CsOH","1614.282356","46066","","","","1617.457564","14","30","224","1644.282356","1614.282356","0","-3.175207856","China","EAS","AS"
"15","14","Msn.dk","1581.611563","46264","FALSE","","","1581.090924","15","0","26","1581.611563","1581.611563","0","0.5206391224","Denmark","NEU","EU"`;

const TRDB = `"Date","Tournament","Target","Opponent","Target TR","Opponent TR","Target Score","Opponent Score","Winner","Tier","Multiplier","New TR rating","Rating Change","","","",""
"2026-05-03","Epohers World Cup 2","MarineLorD","Anotand","2372.717525","2108.492155","4","3","1","A-Tier","0.9","2377.558998","4.841472506","","","",""
"2026-05-03","Epohers World Cup 2","Anotand","MarineLorD","2108.492155","2372.717525","3","4","0","A-Tier","0.9","2103.650682","-4.841472506","","","",""
"2026-05-03","Epohers World Cup 2","MarineLorD","VortiX","2377.558998","2196.243592","3","4","0","A-Tier","0.9","2357.590605","-19.96839287","","","",""
"2026-05-03","Epohers World Cup 2","VortiX","MarineLorD","2196.243592","2377.558998","4","3","1","A-Tier","0.9","2216.211985","19.96839287","","","",""
"2026-06-28","The Elite Classic IV","VortiX","MarineLorD","2079.351976","2254.095497","3","0","1","S-Tier","1","2145.251587","65.89961116","","","",""
"2026-06-28","The Elite Classic IV","MarineLorD","VortiX","2254.095497","2079.351976","0","3","0","S-Tier","1","2188.195886","-65.89961116","","","",""
"2026-09-19","EGC Masters Fall - Season 2: Playoffs","MarineLorD","Anotand","2329.385108","2115.241585","4","0","1","S-Tier","1","2356.47002","27.08491231","","","",""
"2026-09-19","EGC Masters Fall - Season 2: Playoffs","Anotand","MarineLorD","2115.241585","2329.385108","0","4","0","S-Tier","1","2088.156672","-27.08491231","","","",""
"2026-09-20","EGC Masters Fall - Season 2: Playoffs","MarineLorD","VortiX","2356.47002","2159.907823","5","2","1","S-Tier","1","2378.419566","21.94954569","","","",""
"2026-09-20","EGC Masters Fall - Season 2: Playoffs","VortiX","MarineLorD","2159.907823","2356.47002","2","5","0","S-Tier","1","2137.958277","-21.94954569","","","",""
"2021-09-19","Storrn's Stress Test Cup","ZertoN","shaun","1000","1000","1","0","1","C-Tier","0.8","1012","12","","","Other","1"
"","","","","","","","","0","","","","","","","",""`;

test('parseCsv handles quotes, escaped quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,,3'), [
    ['a', 'b,c', 'd "e"'],
    ['1', '', '3'],
  ]);
});

test('serialToDate converts Sheets serial numbers', () => {
  assert.equal(serialToDate(46285), '2026-09-20');
  assert.equal(serialToDate(-180), '');
});

test('parseEloSheet reads players, activity and the update date', () => {
  const elo = parseEloSheet(parseCsv(ELO));
  assert.equal(elo.sheetDate, '2026-09-20');
  assert.equal(elo.rows.length, 6);
  const [first] = elo.rows;
  assert.deepEqual(first, {
    name: 'MarineLorD',
    rank: 1,
    elo: 2378.4,
    active: true,
    rankChange: 0,
    eloChange: 51,
    lastPlayed: '2026-09-20',
    country: 'France',
    subRegion: 'WEU',
    region: 'EU',
  });
  const csoh = elo.rows.find((r) => r.name === 'CsOH')!;
  assert.equal(csoh.active, false);
  assert.equal(csoh.rank, null);
});

test('parseTrdb groups series per player and skips blank rows', () => {
  const m = parseTrdb(parseCsv(TRDB));
  assert.equal(m.get('marinelord')!.length, 5);
  assert.equal(m.get('vortix')!.length, 3);
  assert.equal(m.get('anotand')!.length, 2);
  assert.equal(m.get('zerton')!.length, 1);
  assert.equal(m.has(''), false);
  const first = m.get('marinelord')![0]!;
  assert.deepEqual(unpackMatch(packMatch(first)), first);
});

test('computeStats: series, maps, streak, peak, rivals, tiers, vs top 10', () => {
  const m = parseTrdb(parseCsv(TRDB)).get('marinelord')!;
  const s = computeStats(m, { today: '2026-09-25', top10: ['VortiX', 'Puppypaw'] });
  assert.deepEqual(s.series, { wins: 3, losses: 2, draws: 0, winRate: 0.6 });
  assert.equal(s.maps.won, 4 + 3 + 0 + 4 + 5);
  assert.equal(s.maps.lost, 3 + 4 + 3 + 0 + 2);
  assert.deepEqual(s.streak, { result: 'W', count: 2 });
  assert.deepEqual(s.peak, { rating: 2378.4, date: '2026-09-20' });
  assert.equal(s.tournaments, 3);
  assert.deepEqual(s.vsTop10, { wins: 1, losses: 2, draws: 0, winRate: 1 / 3 });
  assert.deepEqual(s.rivals[0], { name: 'VortiX', wins: 1, losses: 2, draws: 0 });
  assert.deepEqual(
    s.byTier.map((t) => [t.tier, t.wins, t.losses]),
    [
      ['S-Tier', 2, 1],
      ['A-Tier', 1, 1],
    ]
  );
  assert.equal(s.recent[0]!.date, '2026-09-20');
  assert.equal(s.firstMatch, '2026-05-03');
});

test('computeStats: last 12 months window excludes old matches', () => {
  const m = parseTrdb(parseCsv(TRDB)).get('marinelord')!;
  const s = computeStats(m, { today: '2027-06-01' });
  assert.equal(s.last12Months.wins + s.last12Months.losses, 3);
});

test('headToHead is case-insensitive and newest first', () => {
  const m = parseTrdb(parseCsv(TRDB)).get('marinelord')!;
  const h = headToHead('MarineLorD', m, 'vortix');
  assert.equal(h.opponent, 'VortiX');
  assert.deepEqual([h.series.wins, h.series.losses], [1, 2]);
  assert.equal(h.matches[0]!.date, '2026-09-20');
});

test('buildBoard adds all-time series record', () => {
  const board = buildBoard(parseEloSheet(parseCsv(ELO)), parseTrdb(parseCsv(TRDB)));
  const ml = board.find((r) => r.name === 'MarineLorD')!;
  assert.deepEqual([ml.wins, ml.losses], [3, 2]);
  const msn = board.find((r) => r.name === 'Msn.dk')!;
  assert.deepEqual([msn.wins, msn.losses], [0, 0]);
});

test('pickAoe4WorldProfile strips team tags and prefers Liquipedia-linked profiles', () => {
  const players = [
    { name: 'MarineLorD fan', profile_id: 1 },
    { name: 'marinelord', profile_id: 2, leaderboards: { rm_solo: { rating: 900 } } },
    { name: 'M8.MarineLorD', profile_id: 3, social: { liquipedia: 'x' } },
  ];
  assert.equal(pickAoe4WorldProfile(players, 'MarineLorD')?.profile_id, 3);
  assert.equal(pickAoe4WorldProfile([{ name: 'Msn.dk', profile_id: 9 }], 'Msn.dk')?.profile_id, 9);
  assert.equal(pickAoe4WorldProfile([{ name: 'Someone', profile_id: 4 }], 'MarineLorD'), null);
});

test('ratingHistory keeps the last rating of each day', () => {
  const m = parseTrdb(parseCsv(TRDB)).get('marinelord')!;
  const h = ratingHistory(m);
  assert.deepEqual(
    h.map((p) => p.date),
    ['2026-05-03', '2026-06-28', '2026-09-19', '2026-09-20']
  );
  assert.equal(h[0]!.rating, 2357.6);
});

test('winProbability follows the Elo curve', () => {
  assert.equal(winProbability(2000, 2000), 0.5);
  assert.ok(Math.abs(winProbability(2400, 2000) - 0.909) < 0.001);
});

test('buildTournaments keeps one row per series and totals Elo per player', () => {
  const byPlayer = parseTrdb(parseCsv(TRDB));
  const names = new Map([...byPlayer.keys()].map((k) => [k, k]));
  names.set('marinelord', 'MarineLorD');
  names.set('vortix', 'VortiX');
  names.set('anotand', 'Anotand');
  const t = buildTournaments(byPlayer, names);
  const egc = t.get('EGC Masters Fall - Season 2: Playoffs')!;
  assert.equal(egc.series, 2);
  assert.equal(egc.players, 3);
  assert.equal(egc.matches[0]!.date, '2026-09-20');
  assert.equal(egc.movers[0]!.name, 'MarineLorD');
  assert.equal(egc.movers[0]!.change, 49);
  assert.equal(t.get('Epohers World Cup 2')!.series, 2);
});

test('nationRanking averages the best three active players', () => {
  const board = buildBoard(parseEloSheet(parseCsv(ELO)), new Map());
  const n = nationRanking(board, 3);
  assert.equal(n[0]!.country, 'France');
  assert.equal(n[0]!.score, Math.round((2378.4 + 1000 + 1000) / 3));
  assert.equal(n.find((x) => x.country === 'China'), undefined); // CsOH is inactive
});

test('findUpsets and buildDigest describe an update', () => {
  const trdb = `Date,Tournament,Target,Opponent,Target TR,Opponent TR,Target Score,Opponent Score,Winner,Tier,Multiplier,New TR rating,Rating Change
2026-09-10,Cup,Low,High,1500,2100,2,1,1,B-Tier,0.85,1540,40
2026-09-10,Cup,High,Low,2100,1500,1,2,0,B-Tier,0.85,2060,-40
2026-08-01,Old Cup,Low,High,1500,2200,2,0,1,B-Tier,0.85,1550,50`;
  const byPlayer = parseTrdb(parseCsv(trdb));
  const upsets = findUpsets(byPlayer, new Map([['low', 'Low'], ['high', 'High']]), '2026-09-01');
  assert.equal(upsets.length, 1);
  assert.equal(upsets[0]!.winner, 'Low');
  const board = buildBoard(parseEloSheet(parseCsv(ELO)), new Map());
  const d = buildDigest(board, '2026-09-20', upsets, 'https://example.com/post');
  assert.equal(d.title, 'ATR Tournament Elo update: 20 Sep 2026');
  assert.match(d.text, /\| 1 \| MarineLorD \| 2378 \| \+51 \|/);
  assert.match(d.text, /\*\*Low\*\* \(1500\) beat \*\*High\*\* \(2100\) 2–1 in Cup/);
  assert.match(d.text, /example\.com\/post/);
});

test('nemesis and best matchup need at least 3 decided series', () => {
  const trdb = `Date,Tournament,Target,Opponent,Target Score,Opponent Score,Winner,Tier,New TR rating,Rating Change
2026-01-01,Cup,Me,Strong,0,2,0,A-Tier,1000,-10
2026-01-02,Cup,Me,Strong,0,2,0,A-Tier,990,-10
2026-01-03,Cup,Me,Strong,2,1,1,A-Tier,1000,10
2026-01-04,Cup,Me,Weak,2,0,1,A-Tier,1010,10
2026-01-05,Cup,Me,Weak,2,0,1,A-Tier,1020,10
2026-01-06,Cup,Me,Weak,2,0,1,A-Tier,1030,10
2026-01-07,Cup,Me,Rare,0,2,0,A-Tier,1020,-10`;
  const s = computeStats(parseTrdb(parseCsv(trdb)).get('me')!, { today: '2026-02-01' });
  assert.deepEqual(s.nemesis, { name: 'Strong', wins: 1, losses: 2, winRate: 1 / 3 });
  assert.deepEqual(s.bestMatchup, { name: 'Weak', wins: 3, losses: 0, winRate: 1 });
});

test('predictSeries: Elo alone without head-to-head, recent results weigh more', () => {
  const none = predictSeries(2000, 2000, [], '2026-09-26');
  assert.equal(none.probability, 0.5);
  const mk = (date: string, result: 'W' | 'L') => ({
    date, tournament: 'Cup', opponent: 'B', score: 2, opponentScore: 0, result, tier: 'S-Tier',
    ratingAfter: 0, ratingChange: 0, ratingBefore: 0, opponentRatingBefore: 0,
  });
  const recentWins = predictSeries(2000, 2000, [mk('2026-09-20', 'W'), mk('2026-09-10', 'W'), mk('2026-08-01', 'W')], '2026-09-26');
  const oldWins = predictSeries(2000, 2000, [mk('2022-09-20', 'W'), mk('2022-09-10', 'W'), mk('2022-08-01', 'W')], '2026-09-26');
  assert.ok(recentWins.probability > 0.7, `recent ${recentWins.probability}`);
  assert.ok(oldWins.probability < 0.55 && oldWins.probability > 0.5, `old ${oldWins.probability}`);
  const mixed = predictSeries(2200, 2000, [mk('2026-09-01', 'L'), mk('2026-08-01', 'L')], '2026-09-26');
  assert.ok(mixed.probability < mixed.eloProbability);
  assert.ok(mixed.h2hShift < 0);
});
