import { useEffect, useState } from 'react';
import type { RecordsResponse } from '../../shared/api';
import { getJson } from '../format';
import { Chip, Spinner, type Nav } from '../ui';

const MEDAL = ['text-amber-500', 'text-stone-400', 'text-orange-700'];

export const RecordsView = ({ nav }: { nav: Nav }) => {
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('titles');

  useEffect(() => {
    getJson<RecordsResponse>('/api/records').then(setData, (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Could not load the records')
    );
  }, []);

  if (error) return <p className="px-4 py-6 text-sm text-stone-500">{error}</p>;
  if (!data) return <Spinner />;
  const list = data.records.find((r) => r.id === active) ?? data.records[0];

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {data.records.map((r) => (
          <Chip key={r.id} active={r.id === list?.id} onClick={() => setActive(r.id)}>
            {r.title}
          </Chip>
        ))}
      </div>
      {list && (
        <>
          <p className="mt-2 text-xs text-stone-500">{list.note}</p>
          <ol className="mt-2 divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
            {list.entries.map((e, i) => (
              <li key={`${e.name}-${e.detail}`}>
                <button
                  onClick={() => (e.other ? nav.compare(e.name, e.other) : nav.player(e.name))}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-stone-800"
                >
                  <span className={`w-5 shrink-0 text-right text-sm font-bold tabular-nums ${MEDAL[i] ?? 'text-stone-400'}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {e.name}
                      {e.other && <span className="font-normal text-stone-500"> {e.joiner ?? 'vs'} </span>}
                      {e.other}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{e.detail}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-lg font-bold tabular-nums">{e.value}</span>
                    {e.unit && <span className="block text-[10px] uppercase text-stone-500">{e.unit}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {list.entries.length === 0 && <p className="py-6 text-sm text-stone-500">Nobody qualifies yet.</p>}
        </>
      )}
    </div>
  );
};
