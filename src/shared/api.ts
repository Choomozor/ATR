import type { BoardRow, HeadToHead, PlayerStats } from './atr';

export type SyncStatus = {
  ok: boolean;
  at: string;
  message: string;
};

export type BoardResponse = {
  sheetDate: string;
  syncedAt: string;
  totalMatches: number;
  rows: BoardRow[];
  lastSync: SyncStatus | null;
};

export type TopResponse = {
  sheetDate: string;
  rows: BoardRow[];
};

export type PlayerResponse = {
  row: BoardRow | null;
  name: string;
  stats: PlayerStats;
};

export type H2HResponse = HeadToHead;

export type Aoe4WorldResponse = {
  found: boolean;
  /** true when a moderator linked this profile by hand. */
  linked?: boolean;
  profileId?: number;
  name?: string;
  url?: string;
  soloRating?: number | null;
  soloRank?: number | null;
  soloRankLevel?: string | null;
  soloWinRate?: number | null;
  soloGames?: number | null;
  lastGameAt?: string | null;
};

export type ErrorResponse = { status: 'error'; message: string };
