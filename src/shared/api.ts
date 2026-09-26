import type {
  BoardRow,
  HeadToHead,
  NationStats,
  PackedMatch,
  RankPoint,
  RecordList,
  Title,
  TournamentDetail,
  TournamentSummary,
} from './atr';

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

export type NationResponse = {
  country: string;
  /** Every ATR player of the nation, active first, best Elo first. */
  players: BoardRow[];
  stats: NationStats | null;
  /** Titles won by the nation's players, newest first. */
  titles: Title[];
};

export type RecordsResponse = { sheetDate: string; records: RecordList[] };

export type PredictRequest = { names: string[] };
export type PredictPlayer = { name: string; elo: number; country: string; rank: number | null };
export type PredictResponse = {
  players: PredictPlayer[];
  /** matrix[i][j]: chance that players[i] beats players[j] in a series (Elo + recent head-to-head). */
  matrix: number[][];
  /** Names that are not in the ATR. */
  unknown: string[];
};

export type PlayerResponse = {
  row: BoardRow | null;
  name: string;
  /** Every series of the player, oldest first (see unpackMatch). */
  matches: PackedMatch[];
  /** Current active top 10, for the "vs top 10" stat. */
  top10: string[];
  /** Tournaments won, newest first. */
  titles: Title[];
  /** Rank among active players at each month end (current month from the sheet). */
  ranks: RankPoint[];
};

export type TournamentsResponse = { tournaments: TournamentSummary[] };
export type TournamentResponse = TournamentDetail & {
  /** Champion of the event this stage belongs to, when known. */
  title: Title | null;
};

export type H2HResponse = HeadToHead;

export type Aoe4WorldAccount = {
  profileId: number;
  name: string;
  url: string;
  soloRating: number | null;
  soloRank: number | null;
  soloRankLevel: string | null;
  soloWinRate: number | null;
  soloGames: number | null;
  lastGameAt: string | null;
  /** Most played civilizations in ranked 1v1 this season, most played first. */
  civs: CivStat[];
};

export type CivStat = { civ: string; games: number; winRate: number; pickRate: number };

export type Aoe4WorldResponse = {
  found: boolean;
  /** true when moderators linked the accounts by hand. */
  linked: boolean;
  /** Main account and smurfs, best ranked 1v1 rating first. */
  accounts: Aoe4WorldAccount[];
};

/** What the current viewer can see. */
export type MeResponse = {
  predictor: boolean;
  /** Logged in and the subreddit allows fan flairs. */
  fanFlair: boolean;
};

export type FanFlairRequest = { player: string | null };
export type FanFlairResponse = { flair: string | null };

export type ErrorResponse = { status: 'error'; message: string };
