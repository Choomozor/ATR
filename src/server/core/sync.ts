import { redis } from '@devvit/web/server';
import {
  buildBoard,
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
  KEY_MATCHES_POINTER,
  KEY_SYNC_STATUS,
  KEY_TOP10,
  TRDB_TAB,
  sheetCsvUrl,
} from './config';

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
  const startedAt = new Date().toISOString();
  try {
    const [eloRows, trdbRows] = await Promise.all([fetchCsv(ELO_TAB), fetchCsv(TRDB_TAB)]);
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

    const board: StoredBoard = {
      sheetDate: elo.sheetDate,
      syncedAt: startedAt,
      // Each series appears twice in TRDB (once per player).
      totalMatches: Math.round(totalMatches / 2),
      rows: buildBoard(elo, matches),
    };
    const top10 = board.rows.filter((r) => r.active).slice(0, 10).map((r) => r.name);

    const previous = await redis.get(KEY_MATCHES_POINTER);
    await redis.set(KEY_BOARD, JSON.stringify(board));
    await redis.set(KEY_TOP10, JSON.stringify(top10));
    await redis.set(KEY_MATCHES_POINTER, version);
    if (previous && previous !== version) await redis.del(previous);

    const status: SyncStatus = {
      ok: true,
      at: startedAt,
      message: `${board.rows.length} players, ${board.totalMatches} series (sheet updated ${elo.sheetDate || 'unknown'})`,
    };
    await redis.set(KEY_SYNC_STATUS, JSON.stringify(status));
    return status;
  } catch (error) {
    const status: SyncStatus = {
      ok: false,
      at: startedAt,
      message: error instanceof Error ? error.message : String(error),
    };
    console.error('ATR sync failed:', status.message);
    await redis.set(KEY_SYNC_STATUS, JSON.stringify(status));
    return status;
  }
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
