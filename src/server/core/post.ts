import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    subredditName: context.subredditName!,
    title: 'AoE4 Esports Tournament Ranking (ATR): live Tournament Elo, win rates & head-to-head',
    entry: 'default',
  });
};
