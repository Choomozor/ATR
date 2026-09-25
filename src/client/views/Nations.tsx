import { useMemo, useState } from 'react';
import { nationRanking, type BoardRow } from '../../shared/atr';
import { Flag } from '../Flag';
import { type Nav } from '../ui';

export const NationsView = ({ rows, nav }: { rows: BoardRow[]; nav: Nav }) => {
  const nations = useMemo(() => nationRanking(rows, 3), [rows]);
  const [open, setOpen] = useState<string | null>(nations[0]?.country ?? null);

  return (
    <>
      <p className="px-4 pt-3 text-xs text-stone-500">
        Nations ranked by the average Tournament Elo of their 3 best active players. Tap a nation to see its top 5.
      </p>
      <ol className="mt-2 divide-y divide-stone-200 dark:divide-stone-800">
        {nations.map((n, i) => (
          <li key={n.country}>
            <button
              onClick={() => setOpen(open === n.country ? null : n.country)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-stone-900"
              aria-expanded={open === n.country}
            >
              <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {i + 1}
              </span>
              <Flag country={n.country} className="h-4 w-5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{n.country}</span>
                <span className="block truncate text-xs text-stone-500">
                  {n.activePlayers} active player{n.activePlayers > 1 ? 's' : ''} · best: {n.top[0]?.name}
                </span>
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{n.score}</span>
            </button>
            {open === n.country && (
              <ul className="mx-4 mb-3 divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {n.top.map((p, j) => (
                  <li key={p.name}>
                    <button
                      onClick={() => nav.player(p.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    >
                      <span className={`w-4 text-xs tabular-nums ${j < 3 ? 'font-bold' : 'text-stone-500'}`}>{j + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <span className="text-xs text-stone-500">#{p.rank}</span>
                      <span className="w-12 text-right font-mono tabular-nums">{Math.round(p.elo)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </>
  );
};
