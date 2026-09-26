import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { linkAoe4WorldProfiles, parseProfileIds } from '../core/aoe4world';

type LinkPlayerValues = { atrName?: string; profile?: string };

export const forms = new Hono();

forms.post('/link-player', async (c) => {
  const { atrName, profile } = await c.req.json<LinkPlayerValues>();
  const name = (atrName ?? '').trim();
  if (!name) return c.json<UiResponse>({ showToast: 'Player name is required' });

  const raw = (profile ?? '').trim();
  if (!raw) {
    await linkAoe4WorldProfiles(name, []);
    return c.json<UiResponse>({ showToast: `${name}: back to automatic AoE4World matching` });
  }
  const ids = parseProfileIds(raw);
  if (!ids.length) return c.json<UiResponse>({ showToast: 'Could not read any AoE4World profile ID' });
  await linkAoe4WorldProfiles(name, ids);
  return c.json<UiResponse>({
    showToast: `${name} linked to ${ids.length} AoE4World account${ids.length > 1 ? 's' : ''}`,
  });
});
