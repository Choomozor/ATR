import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { scheduler } from '@devvit/web/server';

export const triggers = new Hono();

// Pull the ATR data as soon as the app is installed or upgraded, so the post is never empty.
const syncSoon = async () => {
  await scheduler.runJob({ name: 'atr-sync-now', runAt: new Date(Date.now() + 5_000) });
};

triggers.post('/on-app-install', async (c) => {
  try {
    await syncSoon();
    return c.json<TriggerResponse>({ status: 'success', message: 'Initial ATR sync scheduled' }, 200);
  } catch (error) {
    console.error(`Could not schedule sync: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Could not schedule sync' }, 400);
  }
});

triggers.post('/on-app-upgrade', async (c) => {
  try {
    await syncSoon();
    return c.json<TriggerResponse>({ status: 'success', message: 'ATR sync scheduled after upgrade' }, 200);
  } catch (error) {
    console.error(`Could not schedule sync: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Could not schedule sync' }, 400);
  }
});
