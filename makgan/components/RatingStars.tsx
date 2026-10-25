/** 별점 표시(1~5, 반쪽 없음, SPEC-2 A-1). 입력은 RatingInput */
export default function RatingStars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? "star-on" : "star-off"} aria-hidden="true">★</span>)}
    </span>
  );
}
