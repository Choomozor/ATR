import { useEffect, useMemo, useState } from 'react';
import { nationRanking, type BoardRow } from '../../shared/atr';
import type { NationResponse } from '../../shared/api';
import { Flag } from '../Flag';
import { getJson, rateTone, shortDate } from '../format';
import { sharePage } from '../share';
import { BackButton, Delta, FormDots, Section, Spinner, Tile, WinRate, type Nav } from '../ui';

const rate = (w: number, l: number): number | null => (w + l ? w / (w + l) : null);

const PODIUM = [
  {
    medal: '🥇',
    title: '1st',
    label: 'text-amber-700 dark:text-amber-400',
    box: 'bg-gradient-to-b from-amber-100 to-white ring-amber-400 pt-5 dark:from-amber-900/60 dark:to-stone-900 dark:ring-amber-600',
  },
  {
    medal: '🥈',
    title: '2nd',
    label: 'text-stone-500 dark:text-stone-300',
    box: 'bg-gradient-to-b from-stone-200 to-white ring-stone-300 dark:from-stone-700/60 dark:to-stone-900 dark:ring-stone-600',
  },
  {
    medal: '🥉',
    title: '3rd',
    label: 'text-orange-800 dark:text-orange-300',
    box: 'bg-gradient-to-b from-orange-100 to-white ring-orange-300 dark:from-orange-950/60 dark:to-stone-900 dark:ring-orange-800',
  },
];

export const NationView = ({
  country,
  rows,
  onBack,
  backLabel,
  nav,
}: {
  country: string;
  rows: BoardRow[];
  onBack: () => void;
  backLabel: string;
  nav: Nav;
}) => {
  const [data, setData] = useState<NationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState(false);
  const [allVs, setAllVs] = useState(false);

  useEffect(() => {
    getJson<NationResponse>(`/api/nation?country=${encodeURIComponent(country)}`).then(setData, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the nation')
    );
  }, [country]);

  const standing = useMemo(() => {
    const list = nationRanking(rows, 3);
    const i = list.findIndex((n) => n.country.toLowerCase() === country.toLowerCase());
    return i < 0 ? null : { rank: i + 1, score: list[i]!.score, of: list.length };
  }, [rows, country]);

  const active = data ? data.players.filter((p) => p.active) : [];
  const podium = active.slice(0, 3);
  const rest = data ? (allPlayers ? data.players.filter((p) => !podium.includes(p)) : active.slice(3, 13)) : [];
  const chaser = active[3];
  const gap = chaser && podium[2] ? Math.ceil(podium[2].elo - chaser.elo) : null;
  const stats = data?.stats ?? null;
  const vs = stats ? (allVs ? stats.vs : stats.vs.slice(0, 8)) : [];

  const share = () => {
    if (!data) return;
    void sharePage(
      { kind: 'nation', name: data.country },
      `${data.country} in the AoE4 Esports Tournament Ranking${standing ? `: #${standing.rank} nation` : ''}, ${active.length} active players.`
    );
  };

  return (
    <div className="px-4 pb-8 pt-3">
      <BackButton onBack={onBack} label={backLabel} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <header className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Flag country={data.country} className="h-9 w-12 rounded" />
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold">{data.country}</h2>
                <p className="text-sm text-stone-500">
                  {standing ? `#${standing.rank} of ${standing.of} nations` : 'Not ranked'} · {data.players[0]?.region || '–'}
                </p>
              </div>
            </div>
            <button
              onClick={share}
              className="shrink-0 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
            >
              Share ↗
            </button>
          </header>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Tile label="Nation score" value={standing?.score ?? '–'} sub="average Elo of the best 3" />
            <Tile label="Active players" value={active.length} sub={`${data.players.length} in the ATR`} />
            <Tile
              label="vs other nations"
              value={<WinRate rate={stats ? rate(stats.wins, stats.losses) : null} />}
              sub={stats ? `${stats.wins}W – ${stats.losses}L` : undefined}
            />
          </div>

          {podium.length > 0 && (
            <Section title={`Top of ${data.country}`}>
              <div className="grid grid-cols-3 items-end gap-2">
                {/* Silver, gold, bronze: the leader stands in the middle, a step higher. */}
                {[1, 0, 2].map((i) => {
                  const p = podium[i];
                  if (!p) return <div key={i} />;
                  return (
                    <button
                      key={p.name}
                      onClick={() => nav.player(p.name)}
                      className={`min-w-0 rounded-xl p-3 text-center ring-1 transition-transform hover:-translate-y-0.5 ${PODIUM[i]!.box}`}
                    >
                      <span className="block text-2xl leading-none" aria-hidden>
                        {PODIUM[i]!.medal}
                      </span>
                      <span className={`mt-1 block text-[11px] font-bold uppercase tracking-wide ${PODIUM[i]!.label}`}>
                        {PODIUM[i]!.title}
                      </span>
                      <span className={`mt-0.5 block truncate font-bold ${i === 0 ? 'text-lg' : ''}`}>{p.name}</span>
                      <span className="block font-mono text-sm font-semibold tabular-nums">{Math.round(p.elo)}</span>
                      <span className="block text-[11px] text-stone-500">#{p.rank} in the world</span>
                    </button>
                  );
                })}
              </div>
              {chaser && gap !== null && (
                <p className="mt-2 text-center text-xs text-stone-500">
                  Next in line:{' '}
                  <button onClick={() => nav.player(chaser.name)} className="font-semibold text-stone-700 hover:underline dark:text-stone-300">
                    {chaser.name}
                  </button>
                  , {gap} Elo away from the podium
                </p>
              )}
            </Section>
          )}

          <Section title="Players" aside={<span className="text-xs text-stone-500">by Tournament Elo</span>}>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
              {rest.map((p) => (
                <li key={p.name}>
                  <button
                    onClick={() => nav.player(p.name)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-stone-800 ${p.active ? '' : 'opacity-60'}`}
                  >
                    <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-stone-400">
                      {p.active ? active.indexOf(p) + 1 : '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
                        {p.active ? `#${p.rank} in the world` : `inactive · last series ${shortDate(p.lastPlayed)}`}
                        {p.form && <FormDots form={p.form.slice(-5)} />}
                      </span>
                    </span>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums">
                      <Delta value={p.rankChange} />
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono tabular-nums">{Math.round(p.elo)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {rest.length === 0 && <p className="text-sm text-stone-500">No other active player yet: the podium is open.</p>}
            {!allPlayers && data.players.length > podium.length + rest.length && (
              <button
                onClick={() => setAllPlayers(true)}
                className="mt-2 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
              >
                Show all {data.players.length} players (including inactive)
              </button>
            )}
          </Section>

          {vs.length > 0 && (
            <Section title="Against other nations" aside={<span className="text-xs text-stone-500">most played first</span>}>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {vs.map((v) => {
                  const r = rate(v.wins, v.losses);
                  return (
                    <li key={v.country}>
                      <button
                        onClick={() => nav.nation(v.country)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-stone-800"
                      >
                        <Flag country={v.country} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{v.country}</span>
                        <span className="text-xs text-stone-500 tabular-nums">
                          {v.wins}–{v.losses}
                        </span>
                        <span className={`w-10 text-right text-xs font-semibold tabular-nums ${rateTone(r)}`}>
                          {r === null ? '–' : `${Math.round(r * 100)}%`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {stats && stats.vs.length > vs.length && (
                <button
                  onClick={() => setAllVs(true)}
                  className="mt-2 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
                >
                  Show all {stats.vs.length} nations
                </button>
              )}
            </Section>
          )}

        </>
      )}
    </div>
  );
};
