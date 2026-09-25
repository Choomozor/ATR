import './index.css';

import { navigateTo } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { BoardRow, Match } from '../shared/atr';
import type { Aoe4WorldResponse, BoardResponse, H2HResponse, PlayerResponse } from '../shared/api';
import { Flag } from './Flag';
import { getJson, pct, shortDate } from './format';

const PAGE = 100;
const ATR_SHEET_URL = 'https://docs.google.com/spreadsheets/d/12CKvt3uO1NWBL3DsBN0adcynPUcuOIpCkobvgtymJq8';

// ------------------------------------------------------------------ small pieces

const Delta = ({ value, digits = 0 }: { value: number; digits?: number }) =>
  value === 0 ? (
    <span className="text-stone-400">–</span>
  ) : (
    <span className={value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
      {value > 0 ? '▲' : '▼'}
      {Math.abs(digits ? Number(value.toFixed(digits)) : Math.round(value))}
    </span>
  );

const Tile = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
    <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
    <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-stone-500 tabular-nums">{sub}</p>}
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-5">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
      {title}
    </h3>
    {children}
  </section>
);

const ResultBadge = ({ r }: { r: Match['result'] }) => (
  <span
    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-white ${
      r === 'W' ? 'bg-emerald-600' : r === 'L' ? 'bg-rose-600' : 'bg-stone-400'
    }`}
  >
    {r}
  </span>
);

const MatchList = ({ matches, onPick }: { matches: Match[]; onPick?: (name: string) => void }) => (
  <ul className="divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
    {matches.map((m, i) => (
      <li key={`${m.date}-${m.opponent}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
        <ResultBadge r={m.result} />
        <span className="w-8 shrink-0 text-center font-mono tabular-nums">
          {m.score}-{m.opponentScore}
        </span>
        <div className="min-w-0 flex-1">
          <button
            className="truncate font-semibold hover:underline disabled:no-underline"
            disabled={!onPick}
            onClick={() => onPick?.(m.opponent)}
          >
            vs {m.opponent}
          </button>
          <p className="truncate text-xs text-stone-500">
            {m.tournament} · {m.tier}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="text-stone-500">{shortDate(m.date)}</p>
          <Delta value={m.ratingChange} />
        </div>
      </li>
    ))}
  </ul>
);

const Spinner = () => (
  <div className="flex justify-center py-10">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
  </div>
);

// ------------------------------------------------------------------ AoE4World

const Aoe4WorldCard = ({ name }: { name: string }) => {
  const [data, setData] = useState<Aoe4WorldResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getJson<Aoe4WorldResponse>(`/api/aoe4world?name=${encodeURIComponent(name)}`).then(setData, () =>
      setFailed(true)
    );
  }, [name]);

  if (failed) return <p className="text-sm text-stone-500">AoE4World is unavailable right now.</p>;
  if (!data) return <p className="text-sm text-stone-500">Looking up AoE4World…</p>;
  if (!data.found) return <p className="text-sm text-stone-500">No matching AoE4World profile found.</p>;

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold">{data.name}</p>
        <button
          className="shrink-0 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
          onClick={() => data.url && navigateTo(data.url)}
        >
          Open on AoE4World ↗
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] uppercase text-stone-500">Ranked 1v1</p>
          <p className="font-bold tabular-nums">{data.soloRating ?? '–'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-stone-500">Ladder rank</p>
          <p className="font-bold tabular-nums">{data.soloRank ? `#${data.soloRank}` : '–'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-stone-500">Win rate</p>
          <p className="font-bold tabular-nums">
            {data.soloWinRate !== null && data.soloWinRate !== undefined ? `${Math.round(data.soloWinRate)}%` : '–'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        {data.soloRankLevel ? `${data.soloRankLevel.replace('_', ' ')} · ` : ''}
        {data.soloGames ?? 0} games this season
        {data.linked ? ' · profile set by the mods' : ' · matched automatically by name'}
      </p>
    </div>
  );
};

// ------------------------------------------------------------------ head-to-head

const H2HBox = ({ a, b, onPick }: { a: string; b: string; onPick: (name: string) => void }) => {
  const [data, setData] = useState<H2HResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getJson<H2HResponse>(`/api/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then(setData, () =>
      setFailed(true)
    );
  }, [a, b]);
  if (failed) return <p className="text-sm text-stone-500">Could not load the head-to-head.</p>;
  if (!data) return <Spinner />;
  if (data.matches.length === 0) {
    return <p className="text-sm text-stone-500">No tournament series between {a} and {b} in the ATR.</p>;
  }
  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <span className="w-1/3 truncate font-semibold">{a}</span>
        <span className="text-center">
          <span className="text-2xl font-bold tabular-nums">
            {data.series.wins} – {data.series.losses}
          </span>
          <span className="block text-xs text-stone-500 tabular-nums">
            maps {data.maps.won}–{data.maps.lost}
          </span>
        </span>
        <span className="w-1/3 truncate text-right font-semibold">{data.opponent}</span>
      </div>
      <MatchList matches={data.matches} onPick={onPick} />
    </>
  );
};

// ------------------------------------------------------------------ player page

const PlayerView = ({
  name,
  names,
  onBack,
  onPick,
}: {
  name: string;
  names: string[];
  onBack: () => void;
  onPick: (name: string) => void;
}) => {
  const [data, setData] = useState<PlayerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rival, setRival] = useState('');
  const [compare, setCompare] = useState<string | null>(null);

  useEffect(() => {
    getJson<PlayerResponse>(`/api/player?name=${encodeURIComponent(name)}`).then(setData, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load player')
    );
  }, [name]);

  const submitCompare = () => {
    const match = names.find((n) => n.toLowerCase() === rival.trim().toLowerCase());
    setCompare(match ?? (rival.trim() || null));
  };

  const row = data?.row;
  const s = data?.stats;

  return (
    <div className="px-4 pb-8 pt-3">
      <button className="mb-3 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={onBack}>
        ← Ranking
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!data && !error && <Spinner />}
      {data && s && (
        <>
          <header className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-stone-500">
                {row?.country && <Flag country={row.country} />}
                {[row?.country, row?.subRegion].filter(Boolean).join(' · ') || 'Country unknown'}
              </p>
              <h2 className="truncate text-2xl font-bold">{data.name}</h2>
              <p className="text-sm text-stone-500">
                {row?.active ? `#${row.rank} active` : 'Inactive'} · last series {shortDate(s.lastMatch)}
              </p>
            </div>
            {row && (
              <div className="shrink-0 text-right">
                <p className="text-3xl font-bold tabular-nums">{Math.round(row.elo)}</p>
                <p className="text-xs">
                  <Delta value={row.eloChange} /> <span className="text-stone-500">since last update</span>
                </p>
              </div>
            )}
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="Series win rate"
              value={pct(s.series.winRate)}
              sub={`${s.series.wins}W – ${s.series.losses}L`}
            />
            <Tile label="Map win rate" value={pct(s.maps.winRate)} sub={`${s.maps.won} – ${s.maps.lost} maps`} />
            <Tile
              label="Last 12 months"
              value={pct(s.last12Months.winRate)}
              sub={`${s.last12Months.wins}W – ${s.last12Months.losses}L`}
            />
            <Tile
              label="Peak Elo"
              value={s.peak ? Math.round(s.peak.rating) : '–'}
              sub={s.peak ? shortDate(s.peak.date) : undefined}
            />
            <Tile
              label="Current streak"
              value={s.streak ? `${s.streak.count}${s.streak.result}` : '–'}
              sub={s.streak?.result === 'W' ? 'series won in a row' : s.streak ? 'series lost in a row' : undefined}
            />
            <Tile
              label="vs current top 10"
              value={pct(s.vsTop10?.winRate)}
              sub={s.vsTop10 ? `${s.vsTop10.wins}W – ${s.vsTop10.losses}L` : undefined}
            />
            <Tile label="Tournaments" value={s.tournaments} sub={`since ${shortDate(s.firstMatch)}`} />
            <Tile label="Series played" value={s.series.wins + s.series.losses + s.series.draws} />
          </div>

          {s.byTier.length > 0 && (
            <Section title="By tournament tier">
              <div className="grid grid-cols-4 gap-2 text-center">
                {s.byTier.map((t) => (
                  <div
                    key={t.tier}
                    className="rounded-lg bg-white p-2 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
                  >
                    <p className="text-xs font-semibold">{t.tier.replace('-Tier', '')}</p>
                    <p className="font-bold tabular-nums">{pct(t.winRate)}</p>
                    <p className="text-[11px] text-stone-500 tabular-nums">
                      {t.wins}–{t.losses}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Ranked ladder (AoE4World)">
            <Aoe4WorldCard key={data.name} name={data.name} />
          </Section>

          <Section title="Head-to-head">
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitCompare();
              }}
            >
              <input
                list="atr-players"
                value={rival}
                onChange={(e) => setRival(e.target.value)}
                placeholder="Compare with a player…"
                className="h-9 min-w-0 flex-1 rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
              />
              <button className="h-9 rounded-full bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">
                Compare
              </button>
            </form>
            {s.rivals.length > 0 && !compare && (
              <div className="flex flex-wrap gap-2">
                {s.rivals.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => setCompare(r.name)}
                    className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-stone-300 hover:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
                  >
                    {r.name} <span className="text-stone-500 tabular-nums">{r.wins}–{r.losses}</span>
                  </button>
                ))}
              </div>
            )}
            {compare && <H2HBox key={`${data.name}|${compare}`} a={data.name} b={compare} onPick={onPick} />}
          </Section>

          <Section title="Recent series">
            <MatchList matches={s.recent} onPick={onPick} />
          </Section>
        </>
      )}
    </div>
  );
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
          <span className="block truncate text-xs text-stone-500">
            {played > 0 ? `${pct(r.wins / played)} of ${played} series won` : 'No series recorded'}
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

export const App = () => {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const [showInactive, setShowInactive] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [player, setPlayer] = useState<string | null>(null);

  useEffect(() => {
    getJson<BoardResponse>('/api/board').then(setBoard, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the ranking')
    );
  }, []);

  const regions = useMemo(() => {
    const set = new Set((board?.rows ?? []).filter((r) => r.active && r.region).map((r) => r.region));
    return ['All', ...[...set].sort()];
  }, [board]);

  const names = useMemo(() => (board?.rows ?? []).map((r) => r.name), [board]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (board?.rows ?? []).filter(
      (r) =>
        (showInactive || r.active || q) &&
        (region === 'All' || r.region === region) &&
        (!q || r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q))
    );
  }, [board, query, region, showInactive]);

  const openPlayer = (name: string) => {
    setPlayer(name);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <datalist id="atr-players">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {player ? (
        <PlayerView key={player} name={player} names={names} onBack={() => setPlayer(null)} onPick={openPlayer} />
      ) : (
        <>
          <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-4 pb-3 pt-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              AoE4 Esports Tournament Ranking
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-xl font-bold">Tournament Elo</h1>
              {board && <span className="text-xs text-stone-500">Updated {shortDate(board.sheetDate)}</span>}
            </div>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search a player or country…"
              className="mt-2 h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
            />
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
              {regions.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRegion(r);
                    setLimit(PAGE);
                  }}
                  className={`h-7 shrink-0 rounded-full px-3 text-xs font-semibold ${
                    region === r
                      ? 'bg-amber-600 text-white'
                      : 'bg-white ring-1 ring-stone-300 dark:bg-stone-900 dark:ring-stone-700'
                  }`}
                >
                  {r}
                </button>
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
          </header>

          {error && <p className="px-4 py-6 text-sm text-stone-500">{error}</p>}
          {!board && !error && <Spinner />}
          {board && (
            <>
              <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                {rows.slice(0, limit).map((r) => (
                  <RankingRow key={r.name} r={r} onClick={() => openPlayer(r.name)} />
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
              <footer className="px-4 pb-6 pt-2 text-center text-[11px] text-stone-500">
                {board.totalMatches.toLocaleString('en')} tournament series · data from the{' '}
                <button className="underline" onClick={() => navigateTo(ATR_SHEET_URL)}>
                  ATR sheet
                </button>{' '}
                and AoE4World
              </footer>
            </>
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
