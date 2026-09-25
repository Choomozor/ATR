import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { linkAoe4WorldProfile, parseProfileId } from '../core/aoe4world';

type LinkPlayerValues = { atrName?: string; profile?: string };

export const forms = new Hono();

forms.post('/link-player', async (c) => {
  const { atrName, profile } = await c.req.json<LinkPlayerValues>();
  const name = (atrName ?? '').trim();
  if (!name) return c.json<UiResponse>({ showToast: 'Player name is required' });

  const raw = (profile ?? '').trim();
  if (!raw) {
    await linkAoe4WorldProfile(name, null);
    return c.json<UiResponse>({ showToast: `${name}: back to automatic AoE4World matching` });
  }
  const id = parseProfileId(raw);
  if (!id) return c.json<UiResponse>({ showToast: 'Could not read a profile ID from that link' });
  await linkAoe4WorldProfile(name, id);
  return c.json<UiResponse>({ showToast: `${name} linked to AoE4World profile ${id}` });
});
