import { redis } from '@devvit/web/server';
import { nameKey, pickAoe4WorldProfile, type Aoe4WorldPlayer } from '../../shared/atr';
import type { Aoe4WorldAccount, Aoe4WorldResponse, CivStat } from '../../shared/api';
import {
  AOE4WORLD_API,
  AOE4WORLD_CACHE_SECONDS,
  KEY_AOE4WORLD_LINKS,
  aoe4worldCacheKey,
} from './config';

type SoloStats = {
  rating?: number;
  rank?: number;
  rank_level?: string;
  win_rate?: number;
  games_count?: number;
  last_game_at?: string;
  civilizations?: { civilization?: string; win_rate?: number; pick_rate?: number; games_count?: number }[] | null;
};

/** Top civilizations by games played (only on the full profile, not in search results). */
function topCivs(solo: SoloStats | null | undefined, limit = 5): CivStat[] {
  return (solo?.civilizations ?? [])
    .filter((c) => c.civilization && (c.games_count ?? 0) > 0)
    .sort((a, b) => (b.games_count ?? 0) - (a.games_count ?? 0))
    .slice(0, limit)
    .map((c) => ({
      civ: c.civilization!,
      games: c.games_count ?? 0,
      winRate: c.win_rate ?? 0,
      pickRate: c.pick_rate ?? 0,
    }));
}

type SearchPlayer = Aoe4WorldPlayer & {
  site_url?: string;
  leaderboards?: { rm_solo?: SoloStats | null } | null;
};

type ProfileResponse = {
  name: string;
  profile_id: number;
  site_url?: string;
  modes?: { rm_solo?: SoloStats | null } | null;
};

const HEADERS = { Accept: 'application/json', 'User-Agent': 'aoe4-atr-reddit-app' };

function toAccount(p: { name: string; profile_id: number; site_url?: string }, solo: SoloStats | null | undefined): Aoe4WorldAccount {
  return {
    profileId: p.profile_id,
    name: p.name,
    // Always https: Reddit's navigateTo refuses the http:// site_url AoE4World returns on profiles.
    url: `https://aoe4world.com/players/${p.profile_id}`,
    soloRating: solo?.rating ?? null,
    soloRank: solo?.rank ?? null,
    soloRankLevel: solo?.rank_level ?? null,
    soloWinRate: solo?.win_rate ?? null,
    soloGames: solo?.games_count ?? null,
    lastGameAt: solo?.last_game_at ?? null,
    civs: topCivs(solo),
  };
}

async function fetchAccount(id: string): Promise<Aoe4WorldAccount | null> {
  const res = await fetch(`${AOE4WORLD_API}/players/${encodeURIComponent(id)}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AoE4World HTTP ${res.status}`);
  const p = (await res.json()) as ProfileResponse;
  return toAccount(p, p.modes?.rm_solo);
}

const byRating = (a: Aoe4WorldAccount, b: Aoe4WorldAccount): number => (b.soloRating ?? -1) - (a.soloRating ?? -1);

/**
 * Accounts linked on the AoE4World site (main + smurfs). The documented way to get them is the
 * games endpoint with include_alts: its filters list every linked profile id.
 */
async function linkedProfileIds(id: string): Promise<string[]> {
  try {
    const res = await fetch(`${AOE4WORLD_API}/players/${encodeURIComponent(id)}/games?include_alts=true&limit=1`, {
      headers: HEADERS,
    });
    if (!res.ok) return [id];
    const body = (await res.json()) as { filters?: { profile_ids?: number[] } };
    const ids = (body.filters?.profile_ids ?? []).map(String);
    return ids.includes(id) ? ids : [id, ...ids];
  } catch {
    return [id];
  }
}

async function accountsFor(ids: string[]): Promise<Aoe4WorldAccount[]> {
  const expanded = [...new Set((await Promise.all(ids.map(linkedProfileIds))).flat())].slice(0, 8);
  const accounts = (await Promise.all(expanded.map(fetchAccount))).filter((a): a is Aoe4WorldAccount => a !== null);
  return accounts.sort(byRating);
}

async function lookup(atrName: string): Promise<Aoe4WorldResponse> {
  const linked = await redis.hGet(KEY_AOE4WORLD_LINKS, nameKey(atrName));
  if (linked) {
    const accounts = await accountsFor(linked.split(',').filter(Boolean));
    return { found: accounts.length > 0, linked: true, accounts };
  }

  const res = await fetch(`${AOE4WORLD_API}/players/search?query=${encodeURIComponent(atrName)}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`AoE4World HTTP ${res.status}`);
  const body = (await res.json()) as { players?: SearchPlayer[] };
  const best = pickAoe4WorldProfile(body.players ?? [], atrName);
  if (!best) return { found: false, linked: false, accounts: [] };
  const accounts = await accountsFor([String(best.profile_id)]);
  return accounts.length
    ? { found: true, linked: false, accounts }
    : { found: true, linked: false, accounts: [toAccount(best, best.leaderboards?.rm_solo)] };
}

export async function getAoe4WorldProfile(atrName: string): Promise<Aoe4WorldResponse> {
  const cacheKey = aoe4worldCacheKey(nameKey(atrName));
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as Aoe4WorldResponse;

  const result = await lookup(atrName);
  await redis.set(cacheKey, JSON.stringify(result));
  await redis.expire(cacheKey, AOE4WORLD_CACHE_SECONDS);
  return result;
}

/** Moderator override: pin an ATR name to one or more AoE4World profile ids (empty list = automatic). */
export async function linkAoe4WorldProfiles(atrName: string, profileIds: string[]): Promise<void> {
  const key = nameKey(atrName);
  if (profileIds.length) await redis.hSet(KEY_AOE4WORLD_LINKS, { [key]: profileIds.join(',') });
  else await redis.hDel(KEY_AOE4WORLD_LINKS, [key]);
  await redis.del(aoe4worldCacheKey(key));
}

/**
 * Reads every profile id from free text: "1102458", "https://aoe4world.com/players/1102458-marinelord",
 * several separated by commas, spaces or new lines.
 */
export function parseProfileIds(input: string): string[] {
  const ids = [...input.matchAll(/players\/(\d+)|(?:^|[\s,;])(\d{3,})(?=$|[\s,;])/g)].map((m) => (m[1] ?? m[2])!);
  return [...new Set(ids)];
}
