import { useEffect, useMemo, useState } from 'react';
import type { TournamentSummary } from '../../shared/atr';
import type { TournamentResponse, TournamentsResponse } from '../../shared/api';
import { getJson, rateTone, shortDate } from '../format';
import { BackButton, Chip, Delta, Section, Spinner, type Nav } from '../ui';

const TIER_STYLE: Record<string, string> = {
  'S-Tier': 'bg-amber-600 text-white',
  'A-Tier': 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  'B-Tier': 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100',
  'C-Tier': 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
};

export const TierBadge = ({ tier }: { tier: string }) => (
  <span
    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${TIER_STYLE[tier] ?? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}`}
  >
    {tier.replace('-Tier', '')}
  </span>
);

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
            <p className="text-sm text-stone-500">
              {t.players} players · {t.series} series
            </p>
          </header>

          {(gainers.length > 0 || losers.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Biggest Elo gains', list: gainers },
                { title: 'Biggest Elo losses', list: losers },
              ].map((col) => (
                <Section key={col.title} title={col.title}>
                  <ul className="divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                    {col.list.map((m) => (
                      <li key={m.name}>
                        <button
                          onClick={() => nav.player(m.name)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
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
              {t.matches.map((m, i) => (
                <li key={`${m.date}-${m.a}-${m.b}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-stone-500">{shortDate(m.date).replace(/ \d{4}$/, '')}</span>
                  <button
                    onClick={() => nav.player(m.a)}
                    className={`min-w-0 flex-1 truncate text-right ${m.winner === 'a' ? 'font-bold' : 'text-stone-500'}`}
                  >
                    {m.a}
                  </button>
                  <span className="w-12 shrink-0 text-center font-mono tabular-nums">
                    {m.scoreA}–{m.scoreB}
                  </span>
                  <button
                    onClick={() => nav.player(m.b)}
                    className={`min-w-0 flex-1 truncate text-left ${m.winner === 'b' ? 'font-bold' : 'text-stone-500'}`}
                  >
                    {m.b}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
};
