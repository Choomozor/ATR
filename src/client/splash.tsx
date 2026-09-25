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

      <ol className="mt-2 min-h-0 flex-1 divide-y divide-stone-200 overflow-y-auto dark:divide-stone-800">
        {error && <li className="py-3 text-sm text-stone-500">{error}</li>}
        {!data &&
          !error &&
          Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="h-7 animate-pulse py-1.5">
              <div className="h-4 w-2/3 rounded bg-stone-200 dark:bg-stone-800" />
            </li>
          ))}
        {data?.rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 py-1 text-sm">
            <span className="w-6 text-right text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {r.rank}
            </span>
            <span className="flex w-4 shrink-0 justify-center">
              <Flag country={r.country} />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span className="w-12 text-right font-mono tabular-nums">{Math.round(r.elo)}</span>
            <span
              className={`w-9 text-right text-xs tabular-nums ${
                r.eloChange > 0 ? 'text-emerald-600' : r.eloChange < 0 ? 'text-rose-600' : 'text-stone-400'
              }`}
            >
              {r.eloChange ? signed(r.eloChange) : ''}
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
