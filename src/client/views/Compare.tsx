import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  addDays,
  computeStats,
  filterByPeriod,
  nameKey,
  ratingHistory,
  unpackMatch,
  type BoardRow,
  type PlayerStats,
} from '../../shared/atr';
import type { PlayerResponse } from '../../shared/api';
import { CompareChart } from '../EloChart';
import { Flag } from '../Flag';
import { getJson, pct } from '../format';
import { sharePage } from '../share';
import { BackButton, Chip, Section, Spinner, type Nav } from '../ui';
import { H2HBox } from './Player';

type Period = 'all' | '12m';
const today = (): string => new Date().toISOString().slice(0, 10);

type Side = { data: PlayerResponse; stats: PlayerStats; row: BoardRow | null };

/** One comparison line: which side is better is shown in bold and in that player's colour. */
type Line = { label: string; a: ReactNode; b: ReactNode; va: number | null; vb: number | null; lowerIsBetter?: boolean };

const rate = (s: { winRate: number | null } | null | undefined) => s?.winRate ?? null;

function buildLines(A: Side, B: Side): Line[] {
  const sTier = (s: PlayerStats) => s.byTier.find((t) => t.tier === 'S-Tier') ?? null;
  const record = (w: number, l: number) => `${w}–${l}`;
  const winLine = (label: string, ra: { winRate: number | null; wins: number; losses: number } | null, rb: typeof ra): Line => ({
    label,
    a: ra ? `${pct(ra.winRate)} · ${record(ra.wins, ra.losses)}` : '–',
    b: rb ? `${pct(rb.winRate)} · ${record(rb.wins, rb.losses)}` : '–',
    va: rate(ra),
    vb: rate(rb),
  });
  return [
    {
      label: 'Tournament Elo',
      a: A.row ? Math.round(A.row.elo) : '–',
      b: B.row ? Math.round(B.row.elo) : '–',
      va: A.row?.elo ?? null,
      vb: B.row?.elo ?? null,
    },
    {
      label: 'Rank',
      a: A.row?.rank ? `#${A.row.rank}` : 'inactive',
      b: B.row?.rank ? `#${B.row.rank}` : 'inactive',
      va: A.row?.rank ?? null,
      vb: B.row?.rank ?? null,
      lowerIsBetter: true,
    },
    {
      label: 'Peak Elo',
      a: A.stats.peak ? Math.round(A.stats.peak.rating) : '–',
      b: B.stats.peak ? Math.round(B.stats.peak.rating) : '–',
      va: A.stats.peak?.rating ?? null,
      vb: B.stats.peak?.rating ?? null,
    },
    winLine('Series', A.stats.series, B.stats.series),
    {
      label: 'Maps',
      a: `${pct(A.stats.maps.winRate)} · ${record(A.stats.maps.won, A.stats.maps.lost)}`,
      b: `${pct(B.stats.maps.winRate)} · ${record(B.stats.maps.won, B.stats.maps.lost)}`,
      va: A.stats.maps.winRate,
      vb: B.stats.maps.winRate,
    },
    winLine('vs top 10', A.stats.vsTop10, B.stats.vsTop10),
    winLine('Last 12 months', A.stats.last12Months, B.stats.last12Months),
    winLine('S-Tier', sTier(A.stats), sTier(B.stats)),
    {
      label: 'Best win streak',
      a: A.stats.bestStreak?.count ?? '–',
      b: B.stats.bestStreak?.count ?? '–',
      va: A.stats.bestStreak?.count ?? null,
      vb: B.stats.bestStreak?.count ?? null,
    },
    {
      label: 'Tournaments',
      a: A.stats.tournaments,
      b: B.stats.tournaments,
      va: A.stats.tournaments,
      vb: B.stats.tournaments,
    },
  ];
}

const better = (l: Line): 'a' | 'b' | null => {
  if (l.va === null || l.vb === null || l.va === l.vb) return null;
  return l.va > l.vb !== Boolean(l.lowerIsBetter) ? 'a' : 'b';
};

export const CompareView = ({
  a,
  b,
  board,
  onBack,
  backLabel,
  nav,
}: {
  a: string;
  b: string;
  board: Map<string, BoardRow>;
  onBack: () => void;
  backLabel: string;
  nav: Nav;
}) => {
  const [pair, setPair] = useState<[PlayerResponse, PlayerResponse] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    const load = (n: string) => getJson<PlayerResponse>(`/api/player?name=${encodeURIComponent(n)}`);
    Promise.all([load(a), load(b)]).then(
      ([x, y]) => setPair([x, y]),
      (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the players')
    );
  }, [a, b]);

  const sides = useMemo(() => {
    if (!pair) return null;
    const from = period === '12m' ? addDays(today(), -365) : null;
    const top10 = pair[0].top10;
    return pair.map((data) => {
      const matches = filterByPeriod(data.matches.map(unpackMatch), from);
      const others = top10.filter((n) => nameKey(n) !== nameKey(data.name));
      return {
        data,
        row: data.row,
        stats: computeStats(matches, { today: today(), top10: others }),
        history: ratingHistory(matches),
        all: data.matches.map(unpackMatch),
      };
    });
  }, [pair, period]);

  const A = sides?.[0];
  const B = sides?.[1];
  const lines = A && B ? buildLines(A, B) : [];

  const share = () => {
    if (!A || !B) return;
    const eloA = A.row ? ` (${Math.round(A.row.elo)})` : '';
    const eloB = B.row ? ` (${Math.round(B.row.elo)})` : '';
    void sharePage(
      { kind: 'compare', a: A.data.name, b: B.data.name },
      `${A.data.name}${eloA} vs ${B.data.name}${eloB}: head-to-head, win chance and stats side by side.`
    );
  };

  return (
    <div className="px-4 pb-8 pt-3">
      <BackButton onBack={onBack} label={backLabel} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!sides && !error && <Spinner />}
      {A && B && (
        <>
          <header className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
              {[A, B].map((side, i) => (
                <button
                  key={side.data.name}
                  onClick={() => nav.player(side.data.name)}
                  className={`min-w-0 hover:underline ${i === 0 ? 'order-1 text-left' : 'order-3 text-right'}`}
                >
                  <span className={`flex items-center gap-1.5 ${i === 0 ? '' : 'justify-end'}`}>
                    {side.row?.country && <Flag country={side.row.country} />}
                    <span
                      className={`truncate text-xl font-bold ${i === 0 ? 'text-amber-700 dark:text-amber-400' : 'text-sky-700 dark:text-sky-400'}`}
                    >
                      {side.data.name}
                    </span>
                  </span>
                </button>
              ))}
              <span className="order-2 text-sm font-semibold text-stone-500">vs</span>
            </div>
            <button
              onClick={share}
              className="shrink-0 pt-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
            >
              Share ↗
            </button>
          </header>

          <div className="mt-4 flex gap-1.5">
            <Chip active={period === 'all'} onClick={() => setPeriod('all')}>
              All time
            </Chip>
            <Chip active={period === '12m'} onClick={() => setPeriod('12m')}>
              Last 12 months
            </Chip>
          </div>

          <Section title="Tournament Elo">
            <CompareChart
              series={[
                { name: A.data.name, points: A.history },
                { name: B.data.name, points: B.history },
              ]}
            />
          </Section>

          <Section title="Side by side">
            <table className="w-full table-fixed overflow-hidden rounded-lg bg-white text-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {lines.map((l) => {
                  const win = better(l);
                  return (
                    <tr key={l.label}>
                      <td
                        className={`truncate px-3 py-2 text-left tabular-nums ${win === 'a' ? 'font-bold text-amber-700 dark:text-amber-400' : ''}`}
                      >
                        {l.a}
                      </td>
                      <td className="w-28 px-1 py-2 text-center text-[11px] uppercase tracking-wide text-stone-500">
                        {l.label}
                      </td>
                      <td
                        className={`truncate px-3 py-2 text-right tabular-nums ${win === 'b' ? 'font-bold text-sky-700 dark:text-sky-400' : ''}`}
                      >
                        {l.b}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          <Section title="Head-to-head">
            <H2HBox player={A.data.name} matches={A.all} opponent={B.data.name} board={board} nav={nav} inCompare />
          </Section>
        </>
      )}
    </div>
  );
};
