import { Hono, type Context } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { runSync } from '../core/sync';

export const schedulerRoutes = new Hono();

// Recurring sync (cron in devvit.json) and on-demand sync (moderator menu / install).
const handler = async (c: Context) => {
  const status = await runSync();
  console.log(`ATR sync ${status.ok ? 'ok' : 'failed'}: ${status.message}`);
  return c.json<TaskResponse>({ status: 'ok' }, 200);
};

schedulerRoutes.post('/atr-sync', handler);
schedulerRoutes.post('/atr-sync-now', handler);
