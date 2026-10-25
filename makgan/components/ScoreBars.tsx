/** 시야·거리·음향 평균 막대(1~5) */
export default function ScoreBars({ view, distance, sound }: { view: number | null; distance: number | null; sound: number | null }) {
  const rows = [["시야", view], ["거리", distance], ["음향", sound]] as const;
  return (
    <dl className="score-bars">
      {rows.map(([label, v]) => (
        <div key={label} className="score-bar">
          <dt>{label}</dt>
          <dd>
            <span className="score-track" aria-hidden="true"><span className="score-fill" style={{ width: `${((v ?? 0) / 5) * 100}%` }} /></span>
            <span className="score-num">{v != null ? v.toFixed(1) : "–"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
