import { useMemo, useState } from 'react';
import { bracketOdds, bracketSize, nameKey, seedOrder, type BoardRow } from '../../shared/atr';
import type { PredictResponse } from '../../shared/api';
import { Flag } from '../Flag';
import { postJson } from '../format';
import { Chip, Section, Spinner, type Nav } from '../ui';

const MAX_PLAYERS = 32;

type Seeding = 'elo' | 'entered';

const roundLabel = (remaining: number): string =>
  remaining === 1 ? 'Win' : remaining === 2 ? 'Final' : remaining === 4 ? 'Semis' : remaining === 8 ? 'Quarters' : `Top ${remaining}`;

const cell = (p: number): string => (p >= 0.995 ? '>99%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

/** Background strength for an odds cell, so favourites stand out at a glance. */
const heat = (p: number): string =>
  p >= 0.5 ? 'bg-amber-200/80 dark:bg-amber-900/70' : p >= 0.25 ? 'bg-amber-100 dark:bg-amber-950' : p >= 0.1 ? 'bg-amber-50 dark:bg-stone-800' : '';

export const PredictorView = ({ rows, nav }: { rows: BoardRow[]; nav: Nav }) => {
  const [names, setNames] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [seeding, setSeeding] = useState<Seeding>('elo');
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => rows.filter((r) => r.active), [rows]);
  const byKey = useMemo(() => new Map(rows.map((r) => [nameKey(r.name), r])), [rows]);

  const change = (next: string[]) => {
    setNames(next.slice(0, MAX_PLAYERS));
    setResult(null);
    setError(null);
  };

  const add = () => {
    const row = byKey.get(nameKey(input));
    if (!row) {
      setError(input.trim() ? `"${input.trim()}" is not in the ATR` : null);
      return;
    }
    if (!names.some((n) => nameKey(n) === nameKey(row.name))) change([...names, row.name]);
    setInput('');
  };

  const predict = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await postJson<PredictResponse>('/api/predict', { names }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compute the odds');
    } finally {
      setLoading(false);
    }
  };

  const bracket = useMemo(() => {
    if (!result || result.players.length < 2) return null;
    const idx = result.players.map((_, i) => i);
    // Seed 1 = best Elo (or first entered); seeds go in standard bracket positions.
    const seeds = seeding === 'elo' ? idx.sort((i, j) => result.players[j]!.elo - result.players[i]!.elo) : idx;
    const n = bracketSize(seeds.length);
    const slots = seedOrder(n).map((seed) => seeds[seed - 1] ?? null);
    const odds = bracketOdds(slots, seeds.length, (i, j) => result.matrix[i]![j]!);
    const rounds = Math.log2(n);
    const columns = Array.from({ length: rounds }, (_, k) => ({ k, label: roundLabel(n / 2 ** (k + 1)) })).slice(-4);
    const table = seeds
      .map((i, s) => ({ i, seed: s + 1, player: result.players[i]!, odds: odds[i]! }))
      .sort((x, y) => y.odds[rounds - 1]! - x.odds[rounds - 1]! || x.seed - y.seed);
    const firstRound: { a: number | null; b: number | null }[] = [];
    for (let q = 0; q < slots.length; q += 2) firstRound.push({ a: slots[q] ?? null, b: slots[q + 1] ?? null });
    const seedOf = new Map(seeds.map((i, s) => [i, s + 1]));
    return { columns, table, firstRound, seedOf };
  }, [result, seeding]);

  return (
    <div className="px-4 pb-6 pt-2">
      <p className="text-sm text-stone-500">
        Add the players of a bracket (up to {MAX_PLAYERS}) to see everyone's chance to go deep and win it. Each series uses
        Tournament Elo and recent head-to-heads; single elimination.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          list="atr-players"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a player…"
          className="h-9 min-w-0 flex-1 rounded-full bg-white px-3 text-sm ring-1 ring-stone-300 outline-none focus:ring-amber-600 dark:bg-stone-900 dark:ring-stone-700"
        />
        <button className="h-9 rounded-full bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700">Add</button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-stone-500">Quick fill:</span>
        {[4, 8, 16, 32].map((n) => (
          <Chip key={n} active={false} onClick={() => change(active.slice(0, n).map((r) => r.name))}>
            Top {n}
          </Chip>
        ))}
        {names.length > 0 && (
          <button onClick={() => change([])} className="ml-auto text-xs font-semibold text-stone-500 hover:underline">
            Clear
          </button>
        )}
      </div>

      {names.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {names.map((n, i) => (
            <li key={n}>
              <button
                onClick={() => change(names.filter((x) => x !== n))}
                title="Remove"
                className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-stone-300 hover:ring-rose-500 dark:bg-stone-900 dark:ring-stone-700"
              >
                {seeding === 'entered' && <span className="text-stone-400 tabular-nums">{i + 1}.</span>}
                <Flag country={byKey.get(nameKey(n))?.country ?? ''} />
                <span className="font-semibold">{n}</span>
                <span aria-hidden className="text-stone-400">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-stone-500">Seeding:</span>
        <Chip active={seeding === 'elo'} onClick={() => setSeeding('elo')}>
          By Elo
        </Chip>
        <Chip active={seeding === 'entered'} onClick={() => setSeeding('entered')}>
          In the order added
        </Chip>
      </div>

      <button
        disabled={names.length < 2 || loading}
        onClick={() => void predict()}
        className="mt-4 h-10 w-full rounded-full bg-amber-600 font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
      >
        {names.length < 2 ? 'Add at least 2 players' : `Predict the bracket (${names.length} players)`}
      </button>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {loading && <Spinner />}

      {bracket && (
        <>
          <Section title="Chance to reach each stage">
            <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-stone-500">
                    <th className="px-2 py-2 text-left font-medium">Seed</th>
                    <th className="px-2 py-2 text-left font-medium">Player</th>
                    {bracket.columns.map((c) => (
                      <th key={c.k} className="px-2 py-2 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {bracket.table.map((t) => (
                    <tr key={t.player.name}>
                      <td className="px-2 py-1.5 text-stone-500 tabular-nums">{t.seed}</td>
                      <td className="max-w-36 px-2 py-1.5">
                        <button onClick={() => nav.player(t.player.name)} className="flex min-w-0 items-center gap-1.5 hover:underline">
                          <Flag country={t.player.country} />
                          <span className="truncate font-semibold">{t.player.name}</span>
                        </button>
                      </td>
                      {bracket.columns.map((c) => {
                        const p = t.odds[c.k] ?? 0;
                        return (
                          <td key={c.k} className={`px-2 py-1.5 text-right tabular-nums ${heat(p)} ${c.label === 'Win' ? 'font-bold' : ''}`}>
                            {cell(p)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="First round">
            <ul className="divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
              {bracket.firstRound.map(({ a, b }, i) => {
                const pa = a !== null && b !== null ? result!.matrix[a]![b]! : null;
                const name = (x: number | null) => (x === null ? null : result!.players[x]!.name);
                return (
                  <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-right">
                      {a !== null ? (
                        <button onClick={() => nav.player(name(a)!)} className="font-semibold hover:underline">
                          <span className="mr-1 text-xs font-normal text-stone-400">{bracket.seedOf.get(a)}</span>
                          {name(a)}
                        </button>
                      ) : (
                        <span className="text-stone-400">bye</span>
                      )}
                    </span>
                    {pa !== null && a !== null && b !== null ? (
                      <button
                        onClick={() => nav.compare(name(a)!, name(b)!)}
                        className="w-24 shrink-0 text-center text-xs tabular-nums hover:underline"
                      >
                        <span className={pa >= 0.5 ? 'font-bold' : 'text-stone-500'}>{cell(pa)}</span>
                        <span className="text-stone-400"> – </span>
                        <span className={pa < 0.5 ? 'font-bold' : 'text-stone-500'}>{cell(1 - pa)}</span>
                      </button>
                    ) : (
                      <span className="w-24 shrink-0 text-center text-xs text-stone-400">walkover</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {b !== null ? (
                        <button onClick={() => nav.player(name(b)!)} className="font-semibold hover:underline">
                          {name(b)}
                          <span className="ml-1 text-xs font-normal text-stone-400">{bracket.seedOf.get(b)}</span>
                        </button>
                      ) : (
                        <span className="text-stone-400">bye</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
          {result && result.unknown.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">Not in the ATR, left out: {result.unknown.join(', ')}</p>
          )}
        </>
      )}
    </div>
  );
};
