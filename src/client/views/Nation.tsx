import { useEffect, useMemo, useState } from 'react';
import { nationRanking, type BoardRow } from '../../shared/atr';
import type { NationResponse } from '../../shared/api';
import { Flag } from '../Flag';
import { getJson, rateTone, shortDate } from '../format';
import { sharePage } from '../share';
import { BackButton, Delta, FormDots, Section, Spinner, TierBadge, Tile, WinRate, type Nav } from '../ui';

const rate = (w: number, l: number): number | null => (w + l ? w / (w + l) : null);

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
  const players = data ? (allPlayers ? data.players : active.slice(0, 10)) : [];
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

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Nation score" value={standing?.score ?? '–'} sub="average Elo of the best 3" />
            <Tile label="Active players" value={active.length} sub={`${data.players.length} in the ATR`} />
            <Tile
              label="vs other nations"
              value={<WinRate rate={stats ? rate(stats.wins, stats.losses) : null} />}
              sub={stats ? `${stats.wins}W – ${stats.losses}L` : undefined}
            />
            <Tile
              label="Titles"
              value={stats?.titles ? `🏆 ${stats.titles}` : '–'}
              sub={stats?.titles ? `${stats.sTierTitles} S-Tier` : 'no tournament won'}
            />
          </div>

          <Section title="Players" aside={<span className="text-xs text-stone-500">by Tournament Elo</span>}>
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
              {players.map((p) => (
                <li key={p.name}>
                  <button
                    onClick={() => nav.player(p.name)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-stone-800 ${p.active ? '' : 'opacity-60'}`}
                  >
                    <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {p.rank ? `#${p.rank}` : '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
                        {p.active ? p.subRegion || 'active' : `inactive · last series ${shortDate(p.lastPlayed)}`}
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
            {data.players.length > players.length && (
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

          {data.titles.length > 0 && (
            <Section title="Recent titles">
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {data.titles.slice(0, 8).map((t) => (
                  <li key={`${t.stage}-${t.date}`}>
                    <button
                      onClick={() => nav.tournament(t.stage)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 dark:hover:bg-stone-800"
                    >
                      <span aria-hidden>🏆</span>
                      <TierBadge tier={t.tier} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{t.event}</span>
                        <span className="block truncate text-xs text-stone-500">
                          {t.champion} beat {t.runnerUp} {t.score}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-stone-500">{shortDate(t.date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
};
