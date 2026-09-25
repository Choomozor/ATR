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
