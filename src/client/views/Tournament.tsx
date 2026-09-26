import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  tournamentHighlights,
  winProbability,
  type SeriesHighlight,
  type TournamentSeries,
  type TournamentSummary,
} from '../../shared/atr';
import type { TournamentResponse, TournamentsResponse } from '../../shared/api';
import { getJson, rateTone, shortDate } from '../format';
import { sharePage } from '../share';
import { BackButton, Chip, Delta, Section, Spinner, TierBadge, type Nav } from '../ui';

/** The winner's Elo win chance before the series, when both ratings are known. */
const winnerChance = (m: TournamentSeries): number | null => {
  if (m.winner === 'draw' || !m.ratingA || !m.ratingB) return null;
  return m.winner === 'a' ? winProbability(m.ratingA, m.ratingB) : winProbability(m.ratingB, m.ratingA);
};

/** Below this pre-series win chance, a win is tagged as an upset. */
const UPSET_CHANCE = 0.35;

const dates = (t: TournamentSummary): string =>
  t.start === t.end ? shortDate(t.start) : `${shortDate(t.start)} – ${shortDate(t.end)}`;

// ------------------------------------------------------------------ list

const TIERS = ['All', 'S-Tier', 'A-Tier', 'B-Tier', 'C-Tier'];
const PAGE = 60;

export const TournamentsView = ({ nav }: { nav: Nav }) => {
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('All');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    getJson<TournamentsResponse>('/api/tournaments').then(
      (r) => setList(r.tournaments),
      (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load tournaments')
    );
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((t) => (tier === 'All' || t.tier === tier) && (!q || t.name.toLowerCase().includes(q)));
  }, [list, query, tier]);

  return (
    <>
      <div className="px-4 pt-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search a tournament…"
          className="h-9 w-full rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
        />
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {TIERS.map((t) => (
            <Chip
              key={t}
              active={tier === t}
              onClick={() => {
                setTier(t);
                setLimit(PAGE);
              }}
            >
              {t === 'All' ? 'All tiers' : t}
            </Chip>
          ))}
        </div>
      </div>
      {error && <p className="px-4 py-6 text-sm text-stone-500">{error}</p>}
      {!list && !error && <Spinner />}
      <ul className="mt-2 divide-y divide-stone-200 dark:divide-stone-800">
        {rows.slice(0, limit).map((t) => (
          <li key={t.name}>
            <button
              onClick={() => nav.tournament(t.name)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-stone-900"
            >
              <TierBadge tier={t.tier} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-stone-500">
                  {dates(t)} · {t.players} players · {t.series} series
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list && rows.length === 0 && <p className="px-4 py-6 text-sm text-stone-500">No tournament matches.</p>}
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

// ------------------------------------------------------------------ highlights

const HighlightCard = ({ label, onClick, title, sub }: { label: string; onClick: () => void; title: ReactNode; sub: ReactNode }) => (
  <button
    onClick={onClick}
    className="min-w-0 rounded-lg bg-white p-3 text-left ring-1 ring-stone-200 transition-colors hover:bg-amber-50 hover:ring-amber-600 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800"
  >
    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">{label}</p>
    <p className="mt-0.5 truncate font-bold">{title}</p>
    <p className="truncate text-xs text-stone-500 tabular-nums">{sub}</p>
  </button>
);

const versus = (h: SeriesHighlight) => (
  <>
    {h.winner} <span className="font-normal text-stone-500">beat</span> {h.loser}
  </>
);

const Highlights = ({ t, nav }: { t: TournamentResponse; nav: Nav }) => {
  const h = useMemo(() => tournamentHighlights(t), [t]);
  const cards: ReactNode[] = [];
  if (h.biggestUpset) {
    const u = h.biggestUpset;
    cards.push(
      <HighlightCard
        key="upset"
        label="Biggest upset"
        onClick={() => nav.compare(u.winner, u.loser)}
        title={versus(u)}
        sub={`${u.score} · only ${Math.max(1, Math.round((u.chance ?? 0) * 100))}% win chance`}
      />
    );
  }
  if (h.clashOfTitans) {
    const c = h.clashOfTitans;
    cards.push(
      <HighlightCard
        key="clash"
        label="Clash of the titans"
        onClick={() => nav.compare(c.winner, c.loser)}
        title={versus(c)}
        sub={`${c.score} · average Elo ${Math.round(c.averageElo ?? 0)}`}
      />
    );
  }
  if (h.bestRun) {
    const r = h.bestRun;
    cards.push(
      <HighlightCard
        key="run"
        label="Best run"
        onClick={() => nav.player(r.name)}
        title={r.name}
        sub={`${r.wins}W – ${r.losses}L · ${r.change > 0 ? '+' : ''}${Math.round(r.change)} Elo`}
      />
    );
  }
  if (h.longestSeries) {
    const l = h.longestSeries;
    cards.push(
      <HighlightCard
        key="long"
        label="Longest series"
        onClick={() => nav.compare(l.winner, l.loser)}
        title={versus(l)}
        sub={`${l.score} · ${l.score.split('–').reduce((sum, n) => sum + Number(n), 0)} maps`}
      />
    );
  }

  const numbers = [
    { label: 'Maps played', value: h.totalMaps, help: 'Maps played in the whole tournament' },
    { label: 'Clean sweeps', value: h.sweeps, help: 'Series won without dropping a map (2–0, 3–0, 4–0…)' },
    { label: 'Deciding maps', value: h.deciders, help: 'Series that went to the last map (2–1, 3–2, 4–3…)' },
    {
      label: 'Favourites won',
      value: h.favouritesWon === null ? '–' : `${Math.round(h.favouritesWon * 100)}%`,
      help: 'Share of series won by the player with the higher Tournament Elo',
    },
  ];

  const title = t.title;
  return (
    <Section title="Highlights">
      {title && (
        <button
          onClick={() => nav.player(title.champion)}
          className="mb-2 flex w-full items-center gap-3 rounded-lg bg-amber-50 p-3 text-left ring-1 ring-amber-300 transition-colors hover:bg-amber-100 dark:bg-amber-950 dark:ring-amber-800 dark:hover:bg-amber-900"
        >
          <span className="text-2xl" aria-hidden>
            🏆
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              {title.stage === t.name ? 'Champion' : `Event champion · decided in ${title.stage.replace(title.event, '').replace(/^\s*[:-]\s*/, '') || 'the main event'}`}
            </span>
            <span className="block truncate text-lg font-bold">{title.champion}</span>
            <span className="block truncate text-xs text-stone-500">
              beat {title.runnerUp} {title.score} in the final · {shortDate(title.date)}
            </span>
          </span>
        </button>
      )}
      {cards.length > 0 && <div className="grid grid-cols-2 gap-2">{cards}</div>}
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {numbers.map((n) => (
          <div
            key={n.label}
            title={n.help}
            className="rounded-lg bg-white px-1 py-2 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
          >
            <p className="text-lg font-bold tabular-nums">{n.value}</p>
            <p className="text-[10px] uppercase leading-tight tracking-wide text-stone-500">{n.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        Clean sweep: won without dropping a map. Deciding map: went to the last map.
      </p>
    </Section>
  );
};

// ------------------------------------------------------------------ one tournament

export const TournamentView = ({
  name,
  onBack,
  backLabel,
  nav,
}: {
  name: string;
  onBack: () => void;
  backLabel: string;
  nav: Nav;
}) => {
  const [t, setT] = useState<TournamentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<TournamentResponse>(`/api/tournament?name=${encodeURIComponent(name)}`).then(setT, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the tournament')
    );
  }, [name]);

  const gainers = t ? t.movers.filter((m) => m.change > 0).slice(0, 5) : [];
  const losers = t ? t.movers.filter((m) => m.change < 0).slice(-5).reverse() : [];

  return (
    <div className="px-4 pb-8 pt-3">
      <BackButton onBack={onBack} label={backLabel} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!t && !error && <Spinner />}
      {t && (
        <>
          <header>
            <div className="flex items-center gap-2">
              <TierBadge tier={t.tier} />
              <span className="text-xs text-stone-500">{dates(t)}</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold [text-wrap:balance]">{t.name}</h2>
            <p className="flex items-baseline justify-between gap-2 text-sm text-stone-500">
              <span>
                {t.players} players · {t.series} series
              </span>
              <button
                onClick={() =>
                  void sharePage(
                    { kind: 'tournament', name: t.name },
                    `${t.name}: every series, upsets and Elo movers in the AoE4 Esports Tournament Ranking.`
                  )
                }
                className="shrink-0 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
              >
                Share ↗
              </button>
            </p>
          </header>

          <Highlights t={t} nav={nav} />

          {(gainers.length > 0 || losers.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Biggest Elo gains', list: gainers },
                { title: 'Biggest Elo losses', list: losers },
              ].map((col) => (
                <Section key={col.title} title={col.title}>
                  <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                    {col.list.map((m) => (
                      <li key={m.name}>
                        <button
                          onClick={() => nav.player(m.name)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-stone-800 dark:active:bg-stone-700"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
                          <span className={`text-xs tabular-nums ${rateTone(m.wins + m.losses ? m.wins / (m.wins + m.losses) : null) || 'text-stone-500'}`}>
                            {m.wins}–{m.losses}
                          </span>
                          <span className="w-12 text-right text-xs tabular-nums">
                            <Delta value={m.change} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
            </div>
          )}

          <Section title="All series" aside={<span className="text-xs text-stone-500">newest first</span>}>
            <ul className="divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
              {t.matches.map((m, i) => {
                const chance = winnerChance(m);
                const upset = chance !== null && chance < UPSET_CHANCE;
                return (
                <li key={`${m.date}-${m.a}-${m.b}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-stone-500">{shortDate(m.date).replace(/ \d{4}$/, '')}</span>
                  <button
                    onClick={() => nav.player(m.a)}
                    className={`min-w-0 flex-1 truncate text-right ${m.winner === 'a' ? 'font-bold' : 'text-stone-500'}`}
                  >
                    {m.a}
                  </button>
                  <button
                    onClick={() => nav.compare(m.a, m.b)}
                    className="flex w-14 shrink-0 flex-col items-center hover:underline"
                    title={chance === null ? undefined : `Winner's Elo win chance before the series: ${Math.round(chance * 100)}%`}
                  >
                    <span className="font-mono tabular-nums">
                      {m.scoreA}–{m.scoreB}
                    </span>
                    {upset && chance !== null && (
                      <span className="rounded bg-amber-100 px-1 text-[9px] font-bold uppercase leading-4 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        upset {Math.round(chance * 100)}%
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => nav.player(m.b)}
                    className={`min-w-0 flex-1 truncate text-left ${m.winner === 'b' ? 'font-bold' : 'text-stone-500'}`}
                  >
                    {m.b}
                  </button>
                </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
};
