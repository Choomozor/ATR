import { navigateTo, showToast } from '@devvit/web/client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  computeStats,
  filterByPeriod,
  headToHead,
  nameKey,
  predictSeries,
  ratingHistory,
  unpackMatch,
  type BoardRow,
  type Match,
} from '../../shared/atr';
import type { Aoe4WorldResponse, PlayerResponse } from '../../shared/api';
import { EloChart } from '../EloChart';
import { Flag } from '../Flag';
import { civName, getJson, pct, rateTone, shortDate } from '../format';
import { sharePage } from '../share';
import { BackButton, Chip, Delta, MatchList, Section, Spinner, Tile, WinRate, type Nav } from '../ui';

type Period = 'all' | '12m' | 'year';
const today = (): string => new Date().toISOString().slice(0, 10);
const periodStart = (p: Period): string | null =>
  p === '12m' ? addDays(today(), -365) : p === 'year' ? `${today().slice(0, 4)}-01-01` : null;

// ------------------------------------------------------------------ AoE4World

/**
 * A real link (so the address shows on hover and can be copied with a right-click) that opens
 * through Reddit's navigateTo. The link is also copied as a fallback, since Reddit may refuse
 * to open some outside sites without telling the app.
 */
const ExternalLink = ({ url, className, children }: { url: string; className?: string; children: ReactNode }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
    onClick={(e) => {
      e.preventDefault();
      navigateTo(url);
      navigator.clipboard.writeText(url).then(
        () => showToast('Link copied: if AoE4World did not open, paste it in your browser'),
        () => undefined
      );
    }}
  >
    {children}
  </a>
);

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
  const [main, ...others] = data.accounts ?? [];
  if (!data.found || !main) return <p className="text-sm text-stone-500">No matching AoE4World profile found.</p>;

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold">{main.name}</p>
        <ExternalLink
          url={main.url}
          className="shrink-0 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          Open on AoE4World ↗
        </ExternalLink>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] uppercase text-stone-500">Ranked 1v1</p>
          <p className="font-bold tabular-nums">{main.soloRating ?? '–'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-stone-500">Ladder rank</p>
          <p className="font-bold tabular-nums">{main.soloRank ? `#${main.soloRank}` : '–'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-stone-500">Win rate</p>
          <p className="font-bold tabular-nums">
            <WinRate rate={main.soloWinRate === null ? null : main.soloWinRate / 100} />
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        {main.soloRankLevel ? `${main.soloRankLevel.replace('_', ' ')} · ` : ''}
        {main.soloGames ?? 0} games this season
        {data.linked ? '' : ' · found by name'}
      </p>
      {main.civs.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-stone-500">Most played civs</p>
          <ul className="mt-1 space-y-1">
            {main.civs.map((c) => (
              <li key={c.civ} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{civName(c.civ)}</span>
                <span className="w-16 text-right text-xs text-stone-500 tabular-nums">{c.games} games</span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums">
                  <WinRate rate={c.winRate / 100} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-stone-500">Other accounts</p>
      )}
      {others.length > 0 && (
        <ul className="mt-1 divide-y divide-stone-200 border-t border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {others.map((acc) => (
            <li key={acc.profileId}>
              <ExternalLink
                url={acc.url}
                className="-mx-1 flex w-[calc(100%+0.5rem)] cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-left text-sm transition-colors hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-stone-800 dark:active:bg-stone-700"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-amber-800 dark:text-amber-300">{acc.name}</span>
                <span className="text-xs text-stone-500 tabular-nums">{acc.soloRank ? `#${acc.soloRank}` : 'unranked'}</span>
                <span className="w-12 text-right font-mono tabular-nums">{acc.soloRating ?? '–'}</span>
                <span aria-hidden className="text-xs text-amber-700 dark:text-amber-400">
                  ↗
                </span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      )}
      {data.linked && (
        <p className="mt-2 text-[11px] text-stone-500">
          Main account set by the mods
        </p>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ head-to-head

export const WinChance = ({ a, b, eloA, eloB, matches }: { a: string; b: string; eloA: number; eloB: number; matches: Match[] }) => {
  const p = predictSeries(eloA, eloB, matches, today());
  const pa = p.probability;
  return (
    <div className="mb-3 rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-stone-500">Win chance for a series today</p>
      <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
        <span className="w-10 text-right">{Math.round(pa * 100)}%</span>
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-amber-600" style={{ width: `${pa * 100}%` }} />
          <div className="h-full w-0.5 bg-white dark:bg-stone-900" />
          <div className="h-full flex-1 bg-sky-700 dark:bg-sky-500" />
        </div>
        <span className="w-10">{Math.round((1 - pa) * 100)}%</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span className="truncate">
          {a} · {Math.round(eloA)}
        </span>
        <span className="truncate text-right">
          {b} · {Math.round(eloB)}
        </span>
      </div>
    </div>
  );
};

export const H2HBox = ({
  player,
  matches,
  opponent,
  board,
  nav,
  inCompare = false,
}: {
  player: string;
  matches: Match[];
  opponent: string;
  board: Map<string, BoardRow>;
  nav: Nav;
  /** Hide the link to the side-by-side view (when already on it). */
  inCompare?: boolean;
}) => {
  const h = headToHead(player, matches, opponent);
  const rowA = board.get(nameKey(player));
  const rowB = board.get(nameKey(opponent));
  return (
    <>
      {rowA && rowB && (
        <WinChance a={rowA.name} b={rowB.name} eloA={rowA.elo} eloB={rowB.elo} matches={h.matches} />
      )}
      {!inCompare && (
        <button
          onClick={() => nav.compare(player, h.opponent)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
        >
          <span aria-hidden>⇆</span>
          <span className="truncate">
            {player} vs {h.opponent}: side by side
          </span>
        </button>
      )}
      {h.matches.length === 0 ? (
        <p className="text-sm text-stone-500">
          No tournament series between {player} and {opponent} in the ATR.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
            <span className="w-1/3 truncate font-semibold">{player}</span>
            <span className="text-center">
              <span className={`text-2xl font-bold tabular-nums ${rateTone(h.series.winRate)}`}>
                {h.series.wins} – {h.series.losses}
              </span>
              <span className="block text-xs text-stone-500 tabular-nums">
                all time · maps {h.maps.won}–{h.maps.lost}
              </span>
            </span>
            <button className="w-1/3 truncate text-right font-semibold hover:underline" onClick={() => nav.player(h.opponent)}>
              {h.opponent}
            </button>
          </div>
          <MatchList matches={h.matches} nav={nav} />
        </>
      )}
    </>
  );
};

// ------------------------------------------------------------------ player page

export const PlayerView = ({
  name,
  board,
  onBack,
  backLabel,
  nav,
}: {
  name: string;
  board: Map<string, BoardRow>;
  onBack: () => void;
  backLabel: string;
  nav: Nav;
}) => {
  const [data, setData] = useState<PlayerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [rival, setRival] = useState('');
  const [compare, setCompare] = useState<string | null>(null);

  useEffect(() => {
    getJson<PlayerResponse>(`/api/player?name=${encodeURIComponent(name)}`).then(setData, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load player')
    );
  }, [name]);

  const all = useMemo(() => (data ? data.matches.map(unpackMatch) : []), [data]);
  const inPeriod = useMemo(() => filterByPeriod(all, periodStart(period)), [all, period]);
  const s = useMemo(
    () =>
      data
        ? computeStats(inPeriod, { today: today(), top10: data.top10.filter((n) => nameKey(n) !== nameKey(data.name)) })
        : null,
    [data, inPeriod]
  );
  const history = useMemo(() => ratingHistory(inPeriod), [inPeriod]);

  const row = data?.row ?? null;

  const share = () => {
    const player = data?.name ?? name;
    const parts = [
      `${player}: ${row?.active ? `#${row.rank} in the AoE4 Esports Tournament Ranking` : 'inactive in the AoE4 Esports Tournament Ranking'}`,
      row ? `${Math.round(row.elo)} Tournament Elo` : null,
      s?.series.winRate !== null && s ? `${pct(s.series.winRate)} series won` : null,
    ].filter(Boolean);
    void sharePage({ kind: 'player', name: player }, `${parts.join(', ')}.`);
  };

  const submitCompare = () => {
    const typed = rival.trim().toLowerCase();
    const match = [...board.values()].find((r) => r.name.toLowerCase() === typed);
    setCompare(match?.name ?? (rival.trim() || null));
  };

  return (
    <div className="px-4 pb-8 pt-3">
      <BackButton onBack={onBack} label={backLabel} />
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
                {row?.active ? `#${row.rank} active` : 'Inactive'} · last series {shortDate(all[all.length - 1]?.date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {row && <p className="text-3xl font-bold tabular-nums">{Math.round(row.elo)}</p>}
              {row && (
                <p className="text-xs">
                  <Delta value={row.eloChange} /> <span className="text-stone-500">since last update</span>
                </p>
              )}
              <p className="mt-1 flex justify-end gap-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <button
                  onClick={() => {
                    document.getElementById('h2h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.getElementById('h2h-input')?.focus({ preventScroll: true });
                  }}
                  className="hover:underline"
                >
                  ⇆ Compare
                </button>
                <button onClick={share} className="hover:underline">
                  Share ↗
                </button>
              </p>
            </div>
          </header>

          <div className="mt-4 flex gap-1.5">
            <Chip active={period === 'all'} onClick={() => setPeriod('all')}>
              All time
            </Chip>
            <Chip active={period === '12m'} onClick={() => setPeriod('12m')}>
              Last 12 months
            </Chip>
            <Chip active={period === 'year'} onClick={() => setPeriod('year')}>
              {today().slice(0, 4)}
            </Chip>
          </div>

          <Section title="Tournament Elo">
            <EloChart points={history} />
          </Section>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Series win rate" value={<WinRate rate={s.series.winRate} />} sub={`${s.series.wins}W – ${s.series.losses}L`} />
            <Tile label="Map win rate" value={<WinRate rate={s.maps.winRate} />} sub={`${s.maps.won} – ${s.maps.lost} maps`} />
            <Tile
              label="vs current top 10"
              value={<WinRate rate={s.vsTop10?.winRate} />}
              sub={s.vsTop10 ? `${s.vsTop10.wins}W – ${s.vsTop10.losses}L` : undefined}
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
            <Tile label="Tournaments" value={s.tournaments} sub={s.firstMatch ? `since ${shortDate(s.firstMatch)}` : undefined} />
            <Tile label="Series played" value={s.series.wins + s.series.losses + s.series.draws} />
            <Tile
              label="Best win streak"
              value={s.bestStreak?.count ?? '–'}
              sub={s.bestStreak ? shortDate(s.bestStreak.to) : undefined}
            />
          </div>

          {(s.nemesis || s.bestMatchup) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { label: 'Nemesis', m: s.nemesis },
                { label: 'Best matchup', m: s.bestMatchup },
              ].map(({ label, m }) => (
                <button
                  key={label}
                  disabled={!m}
                  onClick={() => {
                    if (!m) return;
                    setCompare(m.name);
                    document.getElementById('h2h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="rounded-lg bg-white p-3 text-left ring-1 ring-stone-200 enabled:hover:ring-amber-600 dark:bg-stone-900 dark:ring-stone-800"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
                  <p className="mt-0.5 truncate text-lg font-bold">{m?.name ?? '–'}</p>
                  {m && (
                    <p className="text-xs tabular-nums">
                      <WinRate rate={m.winRate} />
                      <span className="text-stone-500">
                        {' '}
                        · {m.wins}W – {m.losses}L
                      </span>
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {s.byTier.length > 0 && (
            <Section title="By tournament tier">
              <div className="grid grid-cols-4 gap-2 text-center">
                {s.byTier.map((t) => (
                  <div key={t.tier} className="rounded-lg bg-white p-2 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
                    <p className="text-xs font-semibold">{t.tier.replace('-Tier', '')}</p>
                    <p className="font-bold tabular-nums">
                      <WinRate rate={t.winRate} />
                    </p>
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

          <div id="h2h" />
          <Section
            title="Head-to-head"
            aside={<span className="text-xs text-stone-500">pick a player, then see them side by side</span>}
          >
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
                id="h2h-input"
                placeholder="Compare with a player…"
                className="h-9 min-w-0 flex-1 rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
              />
              <button className="h-9 rounded-full bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">
                Compare
              </button>
            </form>
            {s.rivals.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {s.rivals.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => setCompare(r.name)}
                    className={`rounded-full px-3 py-1 text-xs ring-1 ${
                      compare === r.name
                        ? 'bg-amber-600 text-white ring-amber-600'
                        : 'bg-white ring-stone-300 hover:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700'
                    }`}
                  >
                    {r.name}{' '}
                    <span className={`tabular-nums ${compare === r.name ? 'opacity-80' : rateTone(r.wins + r.losses ? r.wins / (r.wins + r.losses) : null)}`}>
                      {r.wins}–{r.losses}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {compare && <H2HBox key={compare} player={data.name} matches={all} opponent={compare} board={board} nav={nav} />}
          </Section>

          <Section title="Recent series">
            {s.recent.length ? (
              <MatchList matches={s.recent} nav={nav} />
            ) : (
              <p className="text-sm text-stone-500">No series in this period.</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
};
