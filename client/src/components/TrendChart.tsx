import { formatDate } from '../utils/format';

export interface TrendPoint {
  date: string;
  value: number;
  value2?: number | null;
}

/**
 * Accessible inline-SVG line chart with a data-table fallback. Shows values only — it never
 * interprets a trend. Optional reference band (low/high) is drawn as a shaded area.
 */
export function TrendChart({ title, unit, points, refLow, refHigh, secondLabel }: { title: string; unit: string; points: TrendPoint[]; refLow?: number | null; refHigh?: number | null; secondLabel?: string }) {
  if (!points.length) return <p className="muted">No values recorded yet.</p>;
  const W = 560;
  const H = 180;
  const pad = { l: 44, r: 16, t: 14, b: 30 };
  const all = points.flatMap((p) => [p.value, ...(p.value2 != null ? [p.value2] : [])]).concat([refLow ?? NaN, refHigh ?? NaN].filter((n) => Number.isFinite(n)));
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min);
  const line = (sel: (p: TrendPoint) => number | null | undefined) =>
    points
      .map((p, i) => [i, sel(p)] as const)
      .filter(([, v]) => v != null)
      .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v as number).toFixed(1)}`)
      .join(' ');
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  const hasSecond = points.some((p) => p.value2 != null);
  return (
    <figure className="trend-chart" data-testid="trend-chart">
      <figcaption className="small muted">
        {title} ({unit})
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} trend: ${points.map((p) => `${formatDate(p.date)} ${p.value}${p.value2 != null ? `/${p.value2}` : ''}`).join(', ')} ${unit}`} preserveAspectRatio="xMidYMid meet">
        {refLow != null && refHigh != null ? <rect x={pad.l} y={y(refHigh)} width={W - pad.l - pad.r} height={Math.max(0, y(refLow) - y(refHigh))} fill="var(--color-accent-softer)" /> : null}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-subtle)">
              {Math.round(t * 10) / 10}
            </text>
          </g>
        ))}
        <path d={line((p) => p.value)} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
        {hasSecond ? <path d={line((p) => p.value2)} fill="none" stroke="var(--color-info)" strokeWidth="2" strokeDasharray="6 4" /> : null}
        {points.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
            {p.value2 != null ? <rect x={x(i) - 3.5} y={y(p.value2) - 3.5} width="7" height="7" fill="var(--color-surface)" stroke="var(--color-info)" strokeWidth="2" /> : null}
          </g>
        ))}
        {points.length <= 8
          ? points.map((p, i) => (
              <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-text-subtle)">
                {formatDate(p.date).replace(/ \d{4}$/, '')}
              </text>
            ))
          : null}
      </svg>
      <details>
        <summary className="small">Show values as a table</summary>
        <table className="table">
          <caption className="visually-hidden">{title} values</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value ({unit})</th>
              {hasSecond ? <th scope="col">{secondLabel ?? 'Second value'}</th> : null}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{formatDate(p.date)}</td>
                <td>{p.value}</td>
                {hasSecond ? <td>{p.value2 ?? '—'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
