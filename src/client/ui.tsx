import type { ReactNode } from 'react';
import type { Match } from '../shared/atr';
import { pct, rateTone, shortDate } from './format';

export const Delta = ({ value, digits = 0 }: { value: number; digits?: number }) =>
  value === 0 ? (
    <span className="text-stone-400">–</span>
  ) : (
    <span className={value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
      {value > 0 ? '▲' : '▼'}
      {Math.abs(digits ? Number(value.toFixed(digits)) : Math.round(value))}
    </span>
  );

export const Tile = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
    <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
    <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-stone-500 tabular-nums">{sub}</p>}
  </div>
);

export const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="mt-5">
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

export const ResultBadge = ({ r }: { r: Match['result'] }) => (
  <span
    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white ${
      r === 'W' ? 'bg-emerald-600' : r === 'L' ? 'bg-rose-600' : 'bg-stone-400'
    }`}
  >
    {r}
  </span>
);

/** Recent results as dots, oldest on the left. */
export const WinRate = ({ rate }: { rate: number | null | undefined }) => (
  <span className={rateTone(rate)}>{pct(rate)}</span>
);

/** Recent results as dots, oldest on the left; the latest one is larger and ringed. */
export const FormDots = ({ form }: { form: string }) => (
  <span className="flex items-center gap-0.5" title={`Last ${form.length} series, oldest to latest: ${form}`}>
    {[...form].map((r, i) => {
      const latest = i === form.length - 1;
      return (
        <span
          key={i}
          className={`rounded-full ${latest ? 'ml-0.5 h-2 w-2 ring-1 ring-stone-400 ring-offset-1 ring-offset-stone-50 dark:ring-stone-500 dark:ring-offset-stone-950' : 'h-1.5 w-1.5'} ${
            r === 'W' ? 'bg-emerald-500' : r === 'L' ? 'bg-rose-500' : 'bg-stone-400'
          }`}
        />
      );
    })}
  </span>
);

export const Spinner = () => (
  <div className="flex justify-center py-10">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
  </div>
);

export const BackButton = ({ onBack, label }: { onBack: () => void; label: string }) => (
  <button
    className="mb-3 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400"
    onClick={onBack}
  >
    ← {label}
  </button>
);

export type Nav = {
  player: (name: string) => void;
  tournament: (name: string) => void;
};

export const MatchList = ({ matches, nav }: { matches: Match[]; nav: Nav }) => (
  <ul className="divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
    {matches.map((m, i) => (
      <li key={`${m.date}-${m.opponent}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
        <ResultBadge r={m.result} />
        <span className="w-8 shrink-0 text-center font-mono tabular-nums">
          {m.score}-{m.opponentScore}
        </span>
        <div className="min-w-0 flex-1">
          <button className="block max-w-full truncate font-semibold hover:underline" onClick={() => nav.player(m.opponent)}>
            vs {m.opponent}
          </button>
          <button
            className="block max-w-full truncate text-left text-xs text-stone-500 hover:underline"
            onClick={() => nav.tournament(m.tournament)}
          >
            {m.tournament} · {m.tier}
          </button>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="text-stone-500">{shortDate(m.date)}</p>
          <Delta value={m.ratingChange} />
        </div>
      </li>
    ))}
  </ul>
);

export const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    onClick={onClick}
    className={`h-7 shrink-0 rounded-full px-3 text-xs font-semibold ${
      active ? 'bg-amber-600 text-white' : 'bg-white ring-1 ring-stone-300 dark:bg-stone-900 dark:ring-stone-700'
    }`}
  >
    {children}
  </button>
);
