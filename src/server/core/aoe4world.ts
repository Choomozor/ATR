import { redis } from '@devvit/web/server';
import { nameKey, pickAoe4WorldProfile, type Aoe4WorldPlayer } from '../../shared/atr';
import type { Aoe4WorldAccount, Aoe4WorldResponse } from '../../shared/api';
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
};

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
    url: p.site_url ?? `https://aoe4world.com/players/${p.profile_id}`,
    soloRating: solo?.rating ?? null,
    soloRank: solo?.rank ?? null,
    soloRankLevel: solo?.rank_level ?? null,
    soloWinRate: solo?.win_rate ?? null,
    soloGames: solo?.games_count ?? null,
    lastGameAt: solo?.last_game_at ?? null,
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

async function lookup(atrName: string): Promise<Aoe4WorldResponse> {
  const linked = await redis.hGet(KEY_AOE4WORLD_LINKS, nameKey(atrName));
  if (linked) {
    const ids = linked.split(',').filter(Boolean);
    const accounts = (await Promise.all(ids.map(fetchAccount))).filter((a): a is Aoe4WorldAccount => a !== null);
    return { found: accounts.length > 0, linked: true, accounts: accounts.sort(byRating) };
  }

  const res = await fetch(`${AOE4WORLD_API}/players/search?query=${encodeURIComponent(atrName)}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`AoE4World HTTP ${res.status}`);
  const body = (await res.json()) as { players?: SearchPlayer[] };
  const best = pickAoe4WorldProfile(body.players ?? [], atrName);
  return best
    ? { found: true, linked: false, accounts: [toAccount(best, best.leaderboards?.rm_solo)] }
    : { found: false, linked: false, accounts: [] };
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
