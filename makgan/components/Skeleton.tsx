/** 로딩: 카드 모양 회색 블록(SPEC-2 A-1) */
export default function Skeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-poster" />
          <div className="skeleton-lines">
            <div className="skeleton" style={{ width: "40%" }} />
            <div className="skeleton" style={{ width: "80%" }} />
            <div className="skeleton" style={{ width: "60%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
