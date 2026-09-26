import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TopResponse } from '../shared/api';
import { Flag } from './Flag';
import { getJson, shortDate, signed } from './format';

export const Splash = () => {
  const [data, setData] = useState<TopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<TopResponse>('/api/top?n=32').then(setData, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the ranking')
    );
  }, []);

  return (
    <div className="flex h-full flex-col bg-stone-50 px-4 py-3 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            AoE4 Esports Tournament Ranking
          </p>
          <h1 className="text-lg font-bold leading-tight">Tournament Elo · Top 32</h1>
        </div>
        {data && <span className="shrink-0 text-xs text-stone-500">Updated {shortDate(data.sheetDate)}</span>}
      </header>

      {/* Two columns of 16 so the whole top 32 fits without scrolling inside the feed. */}
      <ol className="mt-2 grid min-h-0 flex-1 grid-flow-col grid-cols-2 grid-rows-16 gap-x-4 overflow-hidden">
        {error && <li className="col-span-2 py-3 text-sm text-stone-500">{error}</li>}
        {!data &&
          !error &&
          Array.from({ length: 32 }, (_, i) => (
            <li key={i} className="flex animate-pulse items-center">
              <div className="h-3 w-2/3 rounded bg-stone-200 dark:bg-stone-800" />
            </li>
          ))}
        {data?.rows.map((r) => (
          <li key={r.name} className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5">
            <span className="w-5 shrink-0 text-right text-[11px] font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {r.rank}
            </span>
            <span className="flex w-4 shrink-0 justify-center">
              <Flag country={r.country} />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span
              className={`shrink-0 font-mono text-xs tabular-nums ${
                r.eloChange > 0 ? 'text-emerald-700 dark:text-emerald-400' : r.eloChange < 0 ? 'text-rose-700 dark:text-rose-400' : ''
              }`}
              title={r.eloChange ? `${signed(r.eloChange)} since the last update` : undefined}
            >
              {Math.round(r.elo)}
            </span>
          </li>
        ))}
      </ol>

      <button
        className="mt-2 h-10 w-full cursor-pointer rounded-full bg-amber-600 font-semibold text-white transition-colors hover:bg-amber-700"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'ranking')}
      >
        Full ranking, win rates & head-to-head
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
