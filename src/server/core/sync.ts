import { gunzipSync } from 'node:zlib';
import { context, reddit, redis, settings } from '@devvit/web/server';
import {
  buildBoard,
  buildDigest,
  buildTournaments,
  addDays,
  computeRecords,
  computeNationStats,
  rankHistories,
  type RankPoint,
  type NationStats,
  findTitles,
  type Title,
  findUpsets,
  nameKey,
  summarize,
  type Digest,
  packMatch,
  parseCsv,
  parseEloSheet,
  parseTrdb,
  type BoardRow,
} from '../../shared/atr';
import type { SyncStatus } from '../../shared/api';
import {
  ELO_TAB,
  KEY_BOARD,
  KEY_DIGEST,
  KEY_LAST_POSTED_DATE,
  KEY_LAST_SHEET_DATE,
  KEY_MATCHES_POINTER,
  KEY_RANKING_POST,
  KEY_RECORDS,
  KEY_TITLES,
  KEY_NATIONS,
  KEY_TOURNAMENT_LIST,
  tournamentsKey,
  ranksKey,
  KEY_SYNC_STATUS,
  KEY_TOP10,
  TRDB_TAB,
  sheetCsvUrl,
} from './config';
import { ELO_CSV as SAMPLE_ELO_CSV, TRDB_CSV as SAMPLE_TRDB_CSV } from './sample';
import { SNAPSHOT_DATE, SNAPSHOT_GZIP_BASE64 } from './snapshot';

export type StoredBoard = {
  sheetDate: string;
  syncedAt: string;
  totalMatches: number;
  rows: BoardRow[];
};

// Redis requests are capped at 5 MB; stay well under it per write.
const MAX_CHUNK_BYTES = 1_000_000;

async function fetchCsv(tab: string): Promise<string[][]> {
  const res = await fetch(sheetCsvUrl(tab));
  if (!res.ok) throw new Error(`Google Sheets returned HTTP ${res.status} for tab "${tab}"`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Tab "${tab}" came back as a web page: is the sheet still public, and the tab name unchanged?`);
  }
  return parseCsv(text);
}

export async function runSync(): Promise<SyncStatus> {
  try {
    const [eloRows, trdbRows] = await Promise.all([fetchCsv(ELO_TAB), fetchCsv(TRDB_TAB)]);
    return await storeData(eloRows, trdbRows, '');
  } catch (error) {
    const status: SyncStatus = {
      ok: false,
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    console.error('ATR sync failed:', status.message);
    await redis.set(KEY_SYNC_STATUS, JSON.stringify(status));
    return status;
  }
}

/**
 * Loads data bundled with the app, for testing before the sheet can be fetched:
 * the full snapshot made by `npm run snapshot` if there is one, otherwise the small built-in sample.
 */
export async function loadSample(): Promise<SyncStatus> {
  try {
    if (SNAPSHOT_GZIP_BASE64) {
      const json = gunzipSync(Buffer.from(SNAPSHOT_GZIP_BASE64, 'base64')).toString('utf8');
      const { elo, trdb } = JSON.parse(json) as { elo: string; trdb: string };
      return await storeData(parseCsv(elo), parseCsv(trdb), ` (snapshot of ${SNAPSHOT_DATE})`);
    }
    return await storeData(parseCsv(SAMPLE_ELO_CSV), parseCsv(SAMPLE_TRDB_CSV), ' (small sample)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Loading bundled data failed:', message);
    return { ok: false, at: new Date().toISOString(), message };
  }
}

/** Writes a big hash in chunks (Redis requests are capped at 5 MB). */
async function writeHash(key: string, entries: Iterable<[string, string]>): Promise<void> {
  let chunk: Record<string, string> = {};
  let bytes = 0;
  for (const [field, value] of entries) {
    if (bytes + value.length > MAX_CHUNK_BYTES && bytes > 0) {
      await redis.hSet(key, chunk);
      chunk = {};
      bytes = 0;
    }
    chunk[field] = value;
    bytes += value.length + field.length;
  }
  if (bytes > 0) await redis.hSet(key, chunk);
}

async function storeData(eloRows: string[][], trdbRows: string[][], label: string): Promise<SyncStatus> {
  const startedAt = new Date().toISOString();
  const elo = parseEloSheet(eloRows);
  const matches = parseTrdb(trdbRows);
  if (elo.rows.length < 10) throw new Error(`Only ${elo.rows.length} players found in "${ELO_TAB}"`);

  // Write match history into a fresh hash, then flip the pointer, so readers
  // never see a half-written dataset.
  const version = `atr:matches:${Date.now().toString(36)}`;
  let chunk: Record<string, string> = {};
  let chunkBytes = 0;
  let totalMatches = 0;
  for (const [player, list] of matches) {
    const value = JSON.stringify(list.map(packMatch));
    totalMatches += list.length;
    if (chunkBytes + value.length > MAX_CHUNK_BYTES && chunkBytes > 0) {
      await redis.hSet(version, chunk);
      chunk = {};
      chunkBytes = 0;
    }
    chunk[player] = value;
    chunkBytes += value.length + player.length;
  }
  if (chunkBytes > 0) await redis.hSet(version, chunk);

  // Canonical spelling of each player (TRDB sometimes changes capitalisation).
  const playerNames = new Map<string, string>();
  for (const r of elo.rows) playerNames.set(nameKey(r.name), r.name);
  for (const list of matches.values()) {
    for (const m of list) if (!playerNames.has(nameKey(m.opponent))) playerNames.set(nameKey(m.opponent), m.opponent);
  }

  const tournaments = buildTournaments(matches, playerNames);
  chunk = {};
  chunkBytes = 0;
  for (const [name, detail] of tournaments) {
    const value = JSON.stringify(detail);
    if (chunkBytes + value.length > MAX_CHUNK_BYTES && chunkBytes > 0) {
      await redis.hSet(tournamentsKey(version), chunk);
      chunk = {};
      chunkBytes = 0;
    }
    chunk[name] = value;
    chunkBytes += value.length + name.length;
  }
  if (chunkBytes > 0) await redis.hSet(tournamentsKey(version), chunk);
  const tournamentList = [...tournaments.values()]
    .map(summarize)
    .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0));

  const board: StoredBoard = {
    sheetDate: elo.sheetDate,
    syncedAt: startedAt,
    // Each series appears twice in TRDB (once per player).
    totalMatches: Math.round(totalMatches / 2),
    rows: buildBoard(elo, matches),
  };
  const top10 = board.rows.filter((r) => r.active).slice(0, 10).map((r) => r.name);
  const ranks = rankHistories(matches, board.rows, elo.sheetDate || startedAt.slice(0, 10));
  await writeHash(ranksKey(version), [...ranks].map(([k, v]): [string, string] => [k, JSON.stringify(v)]));

  const previous = await redis.get(KEY_MATCHES_POINTER);
  await redis.set(KEY_BOARD, JSON.stringify(board));
  await redis.set(KEY_TOP10, JSON.stringify(top10));
  await redis.set(KEY_TOURNAMENT_LIST, JSON.stringify(tournamentList));
  const today = elo.sheetDate || startedAt.slice(0, 10);
  const titles = findTitles(trdbRows, playerNames);
  await redis.set(KEY_TITLES, JSON.stringify(titles));
  await redis.set(KEY_NATIONS, JSON.stringify(Object.fromEntries(computeNationStats(matches, board.rows, titles))));
  await redis.set(KEY_RECORDS, JSON.stringify(computeRecords(matches, playerNames, board.rows, today, titles)));
  await redis.set(KEY_MATCHES_POINTER, version);
  if (previous && previous !== version) await redis.del(previous, tournamentsKey(previous), ranksKey(previous));

  // Summary of this ATR update, for the automatic post. Upsets count from the previous update.
  const lastSheetDate = await redis.get(KEY_LAST_SHEET_DATE);
  if (elo.sheetDate && elo.sheetDate !== lastSheetDate) {
    const since = lastSheetDate && lastSheetDate < elo.sheetDate ? lastSheetDate : addDays(elo.sheetDate, -7);
    const digest = buildDigest(board.rows, elo.sheetDate, findUpsets(matches, playerNames, since), await rankingPostUrl());
    await redis.set(KEY_DIGEST, JSON.stringify(digest));
    await redis.set(KEY_LAST_SHEET_DATE, elo.sheetDate);
    // Never post on the very first sync after install: that's not an update, just the current state.
    if (lastSheetDate && (await settings.get<boolean>('autoPostUpdates'))) await postDigest();
  }

  const status: SyncStatus = {
    ok: true,
    at: startedAt,
    message: `${board.rows.length} players, ${board.totalMatches} series (sheet updated ${elo.sheetDate || 'unknown'})${label}`,
  };
  await redis.set(KEY_SYNC_STATUS, JSON.stringify(status));
  return status;
}

export async function readBoard(): Promise<StoredBoard | null> {
  const raw = await redis.get(KEY_BOARD);
  return raw ? (JSON.parse(raw) as StoredBoard) : null;
}

export async function readSyncStatus(): Promise<SyncStatus | null> {
  const raw = await redis.get(KEY_SYNC_STATUS);
  return raw ? (JSON.parse(raw) as SyncStatus) : null;
}

export async function readTop10(): Promise<string[]> {
  const raw = await redis.get(KEY_TOP10);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function readMatches(playerKey: string): Promise<string | null> {
  const pointer = await redis.get(KEY_MATCHES_POINTER);
  if (!pointer) return null;
  return (await redis.hGet(pointer, playerKey)) ?? null;
}

async function rankingPostUrl(): Promise<string | null> {
  return (await redis.get(KEY_RANKING_POST)) ?? null;
}

export async function readDigest(): Promise<Digest | null> {
  const raw = await redis.get(KEY_DIGEST);
  return raw ? (JSON.parse(raw) as Digest) : null;
}

/** Posts the summary of the latest ATR update, once per sheet date. Returns the post URL. */
export async function postDigest(force = false): Promise<string | null> {
  const digest = await readDigest();
  if (!digest) return null;
  if (!force && (await redis.get(KEY_LAST_POSTED_DATE)) === digest.sheetDate) return null;
  const post = await reddit.submitPost({
    subredditName: context.subredditName!,
    title: digest.title,
    text: digest.text,
  });
  await redis.set(KEY_LAST_POSTED_DATE, digest.sheetDate);
  return `https://www.reddit.com/r/${context.subredditName}/comments/${post.id.replace(/^t3_/, '')}`;
}

export async function readRanks(playerKey: string): Promise<RankPoint[]> {
  const pointer = await redis.get(KEY_MATCHES_POINTER);
  if (!pointer) return [];
  const raw = await redis.hGet(ranksKey(pointer), playerKey);
  return raw ? (JSON.parse(raw) as RankPoint[]) : [];
}

export async function readNationStats(country: string): Promise<NationStats | null> {
  const raw = await redis.get(KEY_NATIONS);
  if (!raw) return null;
  const all = JSON.parse(raw) as Record<string, NationStats>;
  return all[country] ?? null;
}

export async function readTitles(): Promise<Title[]> {
  const raw = await redis.get(KEY_TITLES);
  return raw ? (JSON.parse(raw) as Title[]) : [];
}

export async function readRecords(): Promise<string | null> {
  return (await redis.get(KEY_RECORDS)) ?? null;
}

export async function readTournamentList(): Promise<string | null> {
  return (await redis.get(KEY_TOURNAMENT_LIST)) ?? null;
}

export async function readTournament(name: string): Promise<string | null> {
  const pointer = await redis.get(KEY_MATCHES_POINTER);
  if (!pointer) return null;
  return (await redis.hGet(tournamentsKey(pointer), name)) ?? null;
}
