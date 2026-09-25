// Where the ATR data lives. The sheet must stay "anyone with the link can view".
export const SHEET_ID = '12CKvt3uO1NWBL3DsBN0adcynPUcuOIpCkobvgtymJq8';

// Tab names, exactly as they appear in the sheet (emojis included).
// If a tab gets renamed, update it here and upload a new version of the app.
export const ELO_TAB = '🏆 Tournament ELO';
export const TRDB_TAB = '🗄️TRDB';

export const sheetCsvUrl = (tab: string): string =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

export const AOE4WORLD_API = 'https://aoe4world.com/api/v0';
export const AOE4WORLD_CACHE_SECONDS = 60 * 60;

// Redis keys
export const KEY_BOARD = 'atr:board';
export const KEY_TOP10 = 'atr:top10';
export const KEY_MATCHES_POINTER = 'atr:matches:current';
export const KEY_SYNC_STATUS = 'atr:sync:last';
export const KEY_AOE4WORLD_LINKS = 'aoe4world:links';
export const aoe4worldCacheKey = (name: string): string => `aoe4world:cache:${name}`;
export const KEY_TOURNAMENT_LIST = 'atr:tournaments:list';
export const KEY_DIGEST = 'atr:digest';
export const KEY_LAST_SHEET_DATE = 'atr:sheet-date:last';
export const KEY_LAST_POSTED_DATE = 'atr:sheet-date:posted';
export const KEY_RANKING_POST = 'atr:ranking-post';
/** Tournament details live next to the match history of the same sync. */
export const tournamentsKey = (matchesVersion: string): string => `${matchesVersion}:t`;
