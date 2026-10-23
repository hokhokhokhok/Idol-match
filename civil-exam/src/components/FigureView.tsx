import { useId } from 'react';
import type { Figure } from '../types';

const W = 360;
const H = 290;
const PAD = { l: 34, r: 34, t: 22, b: 30 };

/** 축 최댓값: 지정값, 없으면 모든 좌표의 최댓값 × 1.1 */
export function figureBounds(f: Figure) {
  const pts = [...f.series.flatMap((s) => s.points), ...(f.marks ?? []).map((m) => m.at), ...(f.shades ?? []).flatMap((s) => s.polygon)];
  const xMax = f.xMax ?? Math.max(1, ...pts.map((p) => p[0])) * 1.1;
  const yMax = f.yMax ?? Math.max(1, ...pts.map((p) => p[1])) * 1.1;
  return { xMax, yMax };
}

/** 경제학 그래프: 수요·공급·MR·MC, 무차별곡선·예산선, IS-LM 등을 데이터로 그린다 (흑백·가는 선·축 화살표) */
export function FigureView({ figure: f }: { figure: Figure }) {
  const id = useId().replace(/:/g, '');
  const { xMax, yMax } = figureBounds(f);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (x: number) => PAD.l + (x / xMax) * iw;
  const Y = (y: number) => PAD.t + (1 - y / yMax) * ih;
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const desc = `${f.yLabel}-${f.xLabel} 그래프: ${f.series.map((s) => s.name).join(', ')}`;

  return (
    <figure className="qv-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L10,5 L0,9" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>
        {(f.shades ?? []).map((s, i) => {
          const cx = s.polygon.reduce((a, p) => a + p[0], 0) / s.polygon.length;
          const cy = s.polygon.reduce((a, p) => a + p[1], 0) / s.polygon.length;
          return (
            <g key={`s${i}`}>
              <path d={`${path(s.polygon)} Z`} className="fig-shade" />
              {s.label && (
                <text x={X(cx)} y={Y(cy) + 4} className="fig-label fig-shade-label" textAnchor="middle">
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {/* 축 */}
        <line x1={X(0)} y1={Y(0)} x2={W - 10} y2={Y(0)} className="fig-axis" markerEnd={`url(#${id}-arrow)`} />
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={8} className="fig-axis" markerEnd={`url(#${id}-arrow)`} />
        <text x={W - 6} y={Y(0) + 18} className="fig-label fig-var" textAnchor="end">
          {f.xLabel}
        </text>
        <text x={X(0) - 8} y={14} className="fig-label fig-var" textAnchor="end">
          {f.yLabel}
        </text>
        <text x={X(0) - 6} y={Y(0) + 15} className="fig-label" textAnchor="end">
          O
        </text>
        {f.series.map((s) => {
          const last = s.points[s.points.length - 1];
          const first = s.points[0];
          // 이름은 선의 끝(오른쪽 아래로 내려가는 선이면 끝, 수평선이면 오른쪽)에 붙인다
          const at = last[0] >= first[0] ? last : first;
          return (
            <g key={s.name}>
              <path d={path(s.points)} className={`fig-line${s.dashed ? ' is-dashed' : ''}`} />
              <text x={Math.min(W - 4, X(at[0]) + 4)} y={Math.max(12, Y(at[1]) - 5)} className="fig-label fig-var">
                {s.name}
              </text>
            </g>
          );
        })}
        {(f.marks ?? []).map((m) => {
          // 축 위의 점은 눈금처럼 축 바깥(아래·왼쪽)에, 그 밖의 점은 오른쪽 위에 이름을 단다
          const onX = m.at[1] === 0;
          const onY = m.at[0] === 0;
          const pos = onX
            ? { x: X(m.at[0]), y: Y(0) + 17, anchor: 'middle' as const }
            : onY
              ? { x: X(0) - 6, y: Y(m.at[1]) + 5, anchor: 'end' as const }
              : { x: X(m.at[0]) + 5, y: Y(m.at[1]) - 6, anchor: 'start' as const };
          return (
            <g key={m.label}>
              {!onX && !onY && <path d={`M${X(m.at[0])},${Y(0)} V${Y(m.at[1])} H${X(0)}`} className="fig-guide" />}
              <circle cx={X(m.at[0])} cy={Y(m.at[1])} r={2.6} className="fig-dot" />
              <text x={pos.x} y={pos.y} textAnchor={pos.anchor} className="fig-label">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
