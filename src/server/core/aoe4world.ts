import { redis } from '@devvit/web/server';
import { nameKey, pickAoe4WorldProfile, type Aoe4WorldPlayer } from '../../shared/atr';
import type { Aoe4WorldResponse } from '../../shared/api';
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

function toResponse(
  p: { name: string; profile_id: number; site_url?: string },
  solo: SoloStats | null | undefined,
  linked: boolean
): Aoe4WorldResponse {
  return {
    found: true,
    linked,
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

async function lookup(atrName: string): Promise<Aoe4WorldResponse> {
  const linkedId = await redis.hGet(KEY_AOE4WORLD_LINKS, nameKey(atrName));
  if (linkedId) {
    const res = await fetch(`${AOE4WORLD_API}/players/${encodeURIComponent(linkedId)}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`AoE4World HTTP ${res.status}`);
    const p = (await res.json()) as ProfileResponse;
    return toResponse(p, p.modes?.rm_solo, true);
  }

  const res = await fetch(`${AOE4WORLD_API}/players/search?query=${encodeURIComponent(atrName)}`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`AoE4World HTTP ${res.status}`);
  const body = (await res.json()) as { players?: SearchPlayer[] };
  const best = pickAoe4WorldProfile(body.players ?? [], atrName);
  return best ? toResponse(best, best.leaderboards?.rm_solo, false) : { found: false };
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

/** Moderator override: pin an ATR name to an AoE4World profile id (or clear it). */
export async function linkAoe4WorldProfile(atrName: string, profileId: string | null): Promise<void> {
  const key = nameKey(atrName);
  if (profileId) await redis.hSet(KEY_AOE4WORLD_LINKS, { [key]: profileId });
  else await redis.hDel(KEY_AOE4WORLD_LINKS, [key]);
  await redis.del(aoe4worldCacheKey(key));
}

/** Accepts "1102458", "https://aoe4world.com/players/1102458-marinelord", etc. */
export function parseProfileId(input: string): string | null {
  const m = /(?:players\/)?(\d{3,})/.exec(input.trim());
  return m ? m[1]! : null;
}
