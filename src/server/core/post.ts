import { context, reddit, redis } from '@devvit/web/server';
import { KEY_RANKING_POST } from './config';

export const createPost = async () => {
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName!,
    title: 'AoE4 Esports Tournament Ranking (ATR): live Tournament Elo, win rates & head-to-head',
    entry: 'default',
  });
  // Remembered so the automatic update posts can link to it.
  await redis.set(
    KEY_RANKING_POST,
    `https://www.reddit.com/r/${context.subredditName}/comments/${post.id.replace(/^t3_/, '')}`
  );
  return post;
};
