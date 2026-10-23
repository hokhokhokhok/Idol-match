import { useState } from 'react';

export type BarRow = { label: string; rate: number; detail: string };

/** 단일 계열 가로 막대(0~100%). 값은 텍스트로 항상 함께 표시 */
export function RateBars({ rows, caption }: { rows: BarRow[]; caption: string }) {
  return (
    <table className="rate-bars">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((r) => {
          const pct = Math.round(r.rate * 100);
          return (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="rb-bar" aria-hidden>
                <span className="rb-track">
                  <span className="rb-fill" style={{ width: `${pct}%` }} />
                </span>
              </td>
              <td className="rb-value">
                <strong>{pct}%</strong>
                <span>{r.detail}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export type TrendPoint = { label: string; value: number };

const W = 600;
const H = 180;
const PAD = { l: 34, r: 40, t: 14, b: 22 };

/** 점수 추이(0~100). 마지막 점만 직접 표기, 점을 탭하면 값 표시. 스크린리더용 표 포함 */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + (1 - v / 100) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const shown = sel ?? last;

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${points.length}회 점수 추이`}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="trend-grid" />
            <text x={PAD.l - 8} y={y(v) + 4} className="trend-axis" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={path} className="trend-line" />
        {points.map((p, i) => (
          <g key={i} onClick={() => setSel(sel === i ? null : i)} className="trend-pt">
            <circle cx={x(i)} cy={y(p.value)} r={18} className="trend-hit" />
            <circle cx={x(i)} cy={y(p.value)} r={i === shown ? 5.5 : 4} className="trend-dot" />
          </g>
        ))}
        {points.length > 0 && (
          <text
            x={x(shown)}
            y={y(points[shown].value) - 12}
            textAnchor={shown === last && points.length > 1 ? 'end' : 'middle'}
            className="trend-label"
          >
            {points[shown].value}점{sel != null ? ` · ${points[shown].label}` : ''}
          </text>
        )}
      </svg>
      <table className="sr-only">
        <caption>회차별 점수</caption>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.label}</th>
              <td>{p.value}점</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
