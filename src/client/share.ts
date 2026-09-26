import { context, getShareData, showShareSheet, showToast } from '@devvit/web/client';
import { pageTitle, parsePage, type Page } from './format';

export const postUrl = (): string | null => {
  const { postId, subredditName } = context;
  return postId && subredditName
    ? `https://www.reddit.com/r/${subredditName}/comments/${postId.replace(/^t3_/, '')}`
    : null;
};

/**
 * Opens Reddit's share sheet for this post. The page travels with the link, so whoever opens it
 * lands on the same player, comparison or tournament. Falls back to copying a text + link.
 */
export async function sharePage(page: Page, text: string): Promise<void> {
  try {
    await showShareSheet({ title: `${pageTitle(page)} · AoE4 Tournament Elo`, text, data: JSON.stringify(page) });
    return;
  } catch {
    // Share sheet unavailable on this client: copy instead.
  }
  const url = postUrl();
  try {
    await navigator.clipboard.writeText(`${text}${url ? ` ${url}` : ''}`);
    showToast('Copied: paste it in a comment or a chat');
  } catch {
    showToast('Could not share from this device');
  }
}

/** The page attached to the link this post was opened from, if any. */
export const sharedPage = (): Page | null => {
  try {
    return parsePage(getShareData());
  } catch {
    return null;
  }
};
