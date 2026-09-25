import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, scheduler } from '@devvit/web/server';
import { createPost } from '../core/post';
import { loadSample, postDigest, readDigest } from '../core/sync';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();
    return c.json<UiResponse>({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

menu.post('/sync', async (c) => {
  // Run in the background: fetching and indexing ~40k matches can take a while.
  await scheduler.runJob({ name: 'atr-sync-now', runAt: new Date(Date.now() + 5_000) });
  return c.json<UiResponse>({
    showToast: 'ATR sync started. The ranking refreshes within a minute.',
  });
});

menu.post('/link-player', async (c) => {
  return c.json<UiResponse>({
    showForm: {
      name: 'linkPlayerForm',
      form: {
        title: 'Link an ATR player to AoE4World',
        description:
          'Use this when the automatic match picks the wrong AoE4World profile. Leave the profile empty to go back to automatic matching.',
        acceptLabel: 'Save',
        fields: [
          { type: 'string', name: 'atrName', label: 'Player name exactly as in the ATR', required: true },
          {
            type: 'string',
            name: 'profile',
            label: 'AoE4World profile URL or ID (e.g. https://aoe4world.com/players/1102458)',
          },
        ],
      },
    },
  });
});

menu.post('/load-sample', async (c) => {
  const status = await loadSample();
  return c.json<UiResponse>({
    showToast: status.ok ? `Sample loaded: ${status.message}` : `Could not load the sample: ${status.message}`,
  });
});

menu.post('/post-update', async (c) => {
  const digest = await readDigest();
  if (!digest) return c.json<UiResponse>({ showToast: 'No ATR update summary yet: sync the data first.' });
  try {
    const url = await postDigest(true);
    return url ? c.json<UiResponse>({ navigateTo: url }) : c.json<UiResponse>({ showToast: 'Nothing to post' });
  } catch (error) {
    console.error(`Could not post the update: ${error}`);
    return c.json<UiResponse>({ showToast: 'Could not post the update summary' }, 400);
  }
});
