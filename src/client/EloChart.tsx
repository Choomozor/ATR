import { useMemo, useState, type PointerEvent } from 'react';
import type { RatingPoint } from '../shared/atr';
import { shortDate } from './format';

const W = 600;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

const time = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** Tournament Elo over time: one line, peak marked, crosshair + readout on hover/tap. */
export const EloChart = ({ points }: { points: RatingPoint[] }) => {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = time(points[0]!.date);
    const t1 = time(points[points.length - 1]!.date);
    const ratings = points.map((p) => p.rating);
    const lo = Math.floor((Math.min(...ratings) - 25) / 50) * 50;
    const hi = Math.ceil((Math.max(...ratings) + 25) / 50) * 50;
    const x = (iso: string) => PAD.left + ((time(iso) - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
    const y = (r: number) => PAD.top + (1 - (r - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    const xy = points.map((p) => [x(p.date), y(p.rating)] as const);
    const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const area = `${line}L${xy[xy.length - 1]![0].toFixed(1)},${H - PAD.bottom}L${xy[0]![0].toFixed(1)},${H - PAD.bottom}Z`;
    const step = (hi - lo) / 3;
    const ticks = [0, 1, 2, 3].map((i) => Math.round(lo + i * step));
    let peak = 0;
    points.forEach((p, i) => {
      if (p.rating > points[peak]!.rating) peak = i;
    });
    const years: { label: string; x: number }[] = [];
    for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
      years.push({ label: String(yr), x: x(`${yr}-01-01`) });
    }
    return { xy, line, area, ticks, y, peak, years };
  }, [points]);

  if (!geo) {
    return <p className="text-sm text-stone-500">Not enough series in this period to draw a curve.</p>;
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    geo.xy.forEach(([x], i) => {
      if (Math.abs(x - px) < Math.abs(geo.xy[best]![0] - px)) best = i;
    });
    setHover(best);
  };

  const shown = hover ?? geo.peak;
  const p = points[shown]!;
  const [hx, hy] = geo.xy[shown]!;

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-bold tabular-nums">{Math.round(p.rating)}</span>
        <span className="text-stone-500">
          {hover === null ? 'peak · ' : ''}
          {shortDate(p.date)} · {p.tournament}
        </span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none text-amber-600 dark:text-amber-400"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Tournament Elo from ${shortDate(points[0]!.date)} to ${shortDate(points[points.length - 1]!.date)}`}
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={geo.y(t)}
              y2={geo.y(t)}
              className="stroke-stone-200 dark:stroke-stone-800"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={geo.y(t) + 4} textAnchor="end" className="fill-stone-500 text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {geo.years.map((yr) => (
          <text key={yr.label} x={yr.x} y={H - 6} textAnchor="middle" className="fill-stone-500 text-[11px]">
            {yr.label}
          </text>
        ))}
        <path d={geo.area} fill="currentColor" opacity={0.1} />
        <path d={geo.line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} className="stroke-stone-400" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={hx} cy={hy} r={4.5} fill="currentColor" className="stroke-white dark:stroke-stone-900" strokeWidth={2} />
      </svg>
    </div>
  );
};

export type ChartSeries = { name: string; points: RatingPoint[] };

/** Rating on a date: the last point on or before it (null before the first one). */
const ratingOn = (points: RatingPoint[], t: number): number | null => {
  let value: number | null = null;
  for (const p of points) {
    if (time(p.date) > t) break;
    value = p.rating;
  }
  return value;
};

const TONES = ['text-amber-600 dark:text-amber-400', 'text-sky-700 dark:text-sky-400'];

/** Two players' Tournament Elo on one time axis, with a shared crosshair. */
export const CompareChart = ({ series }: { series: [ChartSeries, ChartSeries] }) => {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length < 2 || series.some((s) => s.points.length === 0)) return null;
    const times = all.map((p) => time(p.date));
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const ratings = all.map((p) => p.rating);
    const lo = Math.floor((Math.min(...ratings) - 25) / 50) * 50;
    const hi = Math.ceil((Math.max(...ratings) + 25) / 50) * 50;
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
    const y = (r: number) => PAD.top + (1 - (r - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
    // Step lines: a rating holds until the next series.
    const lines = series.map((s) =>
      s.points
        .map((p, i) => {
          const px = x(time(p.date)).toFixed(1);
          const py = y(p.rating).toFixed(1);
          return i === 0 ? `M${px},${py}` : `H${px}V${py}`;
        })
        .join('')
    );
    const step = (hi - lo) / 3;
    const ticks = [0, 1, 2, 3].map((i) => Math.round(lo + i * step));
    const years: { label: string; x: number }[] = [];
    for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
      years.push({ label: String(yr), x: x(time(`${yr}-01-01`)) });
    }
    return { t0, t1, x, y, lines, ticks, years };
  }, [series]);

  if (!geo) return <p className="text-sm text-stone-500">Not enough series in this period to draw both curves.</p>;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const f = Math.min(1, Math.max(0, (px - PAD.left) / (W - PAD.left - PAD.right)));
    setHover(geo.t0 + f * (geo.t1 - geo.t0));
  };

  const at = hover ?? geo.t1;
  const values = series.map((s) => ratingOn(s.points, at));
  const hx = geo.x(at);

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <p className="mb-1 flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="text-stone-500">{shortDate(new Date(at).toISOString())}</span>
        {series.map((s, i) => (
          <span key={s.name} className={`font-semibold tabular-nums ${TONES[i]}`}>
            {s.name} {values[i] === null ? '–' : Math.round(values[i]!)}
          </span>
        ))}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Tournament Elo of ${series[0].name} and ${series[1].name}`}
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth={1} />
            <text x={PAD.left - 6} y={geo.y(t) + 4} textAnchor="end" className="fill-stone-500 text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {geo.years.map((yr) => (
          <text key={yr.label} x={yr.x} y={H - 6} textAnchor="middle" className="fill-stone-500 text-[11px]">
            {yr.label}
          </text>
        ))}
        {geo.lines.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={TONES[i]} />
        ))}
        <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} className="stroke-stone-400" strokeWidth={1} strokeDasharray="3 3" />
        {values.map((v, i) =>
          v === null ? null : (
            <circle key={i} cx={hx} cy={geo.y(v)} r={4} fill="currentColor" className={`${TONES[i]} stroke-white dark:stroke-stone-900`} strokeWidth={2} />
          )
        )}
      </svg>
    </div>
  );
};
