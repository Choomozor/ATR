import './index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { nameKey, type BoardRow } from '../shared/atr';
import type { BoardResponse, MeResponse } from '../shared/api';
import { Flag } from './Flag';
import { getJson, pageTitle, shortDate, takeOpenPage, type Page } from './format';
import { Chip, Delta, FormDots, Spinner, WinRate, type Nav } from './ui';
import { CompareView } from './views/Compare';
import { NationView } from './views/Nation';
import { NationsView } from './views/Nations';
import { PlayerView } from './views/Player';
import { PredictorView } from './views/Predictor';
import { RecordsView } from './views/Records';
import { TournamentView, TournamentsView } from './views/Tournament';

const PAGE = 100;
const ATR_SHEET_URL = 'https://docs.google.com/spreadsheets/d/12CKvt3uO1NWBL3DsBN0adcynPUcuOIpCkobvgtymJq8';

type Tab = 'ranking' | 'records' | 'nations' | 'tournaments' | 'predictor';

const TAB_LABEL: Record<Tab, string> = {
  ranking: 'Ranking',
  records: 'Records',
  nations: 'Nations',
  tournaments: 'Tournaments',
  predictor: 'Predictor',
};

// ------------------------------------------------------------------ ranking

const RankingRow = ({ r, onClick }: { r: BoardRow; onClick: () => void }) => {
  const played = r.wins + r.losses;
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-stone-900"
      >
        <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
          {r.rank ?? '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-semibold">
            <Flag country={r.country} />
            <span className="truncate">{r.name}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-stone-500">
            <span className="truncate">
              {played > 0 ? (
                <>
                  <WinRate rate={r.wins / played} /> of {played} series won
                </>
              ) : (
                'No series recorded'
              )}
            </span>
            {r.form && <FormDots form={r.form.slice(-5)} />}
          </span>
        </span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums">
          <Delta value={r.rankChange} />
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
          {Math.round(r.elo)}
        </span>
      </button>
    </li>
  );
};

const RankingView = ({ board, nav }: { board: BoardResponse; nav: Nav }) => {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const [showInactive, setShowInactive] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const regions = useMemo(() => {
    const set = new Set(board.rows.filter((r) => r.active && r.region).map((r) => r.region));
    return ['All', ...[...set].sort()];
  }, [board]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.rows.filter(
      (r) =>
        (showInactive || r.active || q) &&
        (region === 'All' || r.region === region) &&
        (!q || r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q))
    );
  }, [board, query, region, showInactive]);

  return (
    <>
      <div className="px-4 pt-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search a player or country…"
          className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
        />
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
          {regions.map((r) => (
            <Chip
              key={r}
              active={region === r}
              onClick={() => {
                setRegion(r);
                setLimit(PAGE);
              }}
            >
              {r}
            </Chip>
          ))}
          <label className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setLimit(PAGE);
              }}
              className="accent-amber-600"
            />
            Inactive
          </label>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-stone-200 dark:divide-stone-800">
        {rows.slice(0, limit).map((r) => (
          <RankingRow key={r.name} r={r} onClick={() => nav.player(r.name)} />
        ))}
      </ul>
      {rows.length === 0 && <p className="px-4 py-6 text-sm text-stone-500">No player matches.</p>}
      {rows.length > limit && (
        <button
          className="mx-auto my-4 block rounded-full px-4 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-600 dark:text-amber-400"
          onClick={() => setLimit(limit + PAGE)}
        >
          Show more ({rows.length - limit} left)
        </button>
      )}
    </>
  );
};

// ------------------------------------------------------------------ app shell

export const App = () => {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('ranking');
  const [stack, setStack] = useState<Page[]>(() => {
    const page = takeOpenPage();
    return page ? [page] : [];
  });

  // The Predictor tab is private: only listed viewers get it (checked by the server).
  const [me, setMe] = useState<MeResponse>({ predictor: false, fanFlair: false });
  useEffect(() => {
    getJson<MeResponse>('/api/me').then(setMe, () => undefined);
  }, []);
  const predictor = me.predictor;
  const tabs = (Object.keys(TAB_LABEL) as Tab[]).filter((t) => t !== 'predictor' || predictor);

  useEffect(() => {
    getJson<BoardResponse>('/api/board').then(setBoard, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the ranking')
    );
  }, []);

  const byName = useMemo(() => new Map((board?.rows ?? []).map((r) => [nameKey(r.name), r])), [board]);

  const push = (page: Page) => {
    setStack((s) => [...s, page]);
    window.scrollTo(0, 0);
  };
  const nav: Nav = {
    player: (name) => push({ kind: 'player', name }),
    tournament: (name) => push({ kind: 'tournament', name }),
    compare: (a, b) => push({ kind: 'compare', a, b }),
    nation: (name) => push({ kind: 'nation', name }),
  };
  const back = () => setStack((s) => s.slice(0, -1));

  const page = stack[stack.length - 1];
  const previous = stack[stack.length - 2];
  const backLabel = previous ? pageTitle(previous) : TAB_LABEL[tab];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <datalist id="atr-players">
        {(board?.rows ?? []).map((r) => (
          <option key={r.name} value={r.name} />
        ))}
      </datalist>

      {page?.kind === 'player' && (
        <PlayerView
          key={`p:${stack.length}:${page.name}`}
          name={page.name}
          board={byName}
          onBack={back}
          backLabel={backLabel}
          nav={nav}
          canFlair={me.fanFlair}
        />
      )}
      {page?.kind === 'compare' && (
        <CompareView
          key={`c:${stack.length}:${page.a}:${page.b}`}
          a={page.a}
          b={page.b}
          board={byName}
          onBack={back}
          backLabel={backLabel}
          nav={nav}
        />
      )}
      {page?.kind === 'nation' && (
        <NationView
          key={`n:${stack.length}:${page.name}`}
          country={page.name}
          rows={board?.rows ?? []}
          onBack={back}
          backLabel={backLabel}
          nav={nav}
        />
      )}
      {page?.kind === 'tournament' && (
        <TournamentView key={`t:${stack.length}:${page.name}`} name={page.name} onBack={back} backLabel={backLabel} nav={nav} />
      )}

      {!page && (
        <>
          <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-4 pb-2 pt-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              AoE4 Esports Tournament Ranking
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-xl font-bold">Tournament Elo</h1>
              {board && <span className="text-xs text-stone-500">Updated {shortDate(board.sheetDate)}</span>}
            </div>
            <nav className="-mx-4 mt-2 flex gap-4 overflow-x-auto px-4 text-sm font-semibold [scrollbar-width:none]">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`shrink-0 border-b-2 pb-1 ${
                    tab === t
                      ? 'border-amber-600 text-stone-900 dark:text-stone-100'
                      : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </nav>
          </header>

          {error && <p className="px-4 py-6 text-sm text-stone-500">{error}</p>}
          {!board && !error && <Spinner />}
          {board && tab === 'ranking' && <RankingView board={board} nav={nav} />}
          {board && tab === 'records' && <RecordsView nav={nav} />}
          {board && tab === 'nations' && <NationsView rows={board.rows} nav={nav} />}
          {board && tab === 'tournaments' && <TournamentsView nav={nav} />}
          {board && tab === 'predictor' && predictor && <PredictorView rows={board.rows} nav={nav} />}

          {board && (
            <footer className="px-4 pb-6 pt-4 text-center text-[11px] text-stone-500">
              {board.totalMatches.toLocaleString('en')} tournament series · data from the{' '}
              <button className="underline" onClick={() => navigateTo(ATR_SHEET_URL)}>
                ATR sheet
              </button>{' '}
              and AoE4World
              <span className="mt-1 block">
                Age of Empires IV © Microsoft Corporation. Civilization flags used under Microsoft's Game Content Usage
                Rules; not endorsed by or affiliated with Microsoft.
              </span>
            </footer>
          )}
        </>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
