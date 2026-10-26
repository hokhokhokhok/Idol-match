import Link from "next/link";
import RatingStars from "./RatingStars";
import DeleteReviewButton from "./DeleteReviewButton";
import { formatDay } from "@/lib/date";

type Props = {
  review: { id: string; watched_at: string; watch_time?: string | null; rating: number; body: string | null; cast_note: string | null; seat_text: string | null; is_public: boolean };
  heading?: { text: string; href: string };   // MY: 공연 제목
  author?: string | null;                      // 공연 상세: 작성자
  mine?: boolean;
};

export default function ReviewItem({ review: r, heading, author, mine }: Props) {
  return (
    <article className="review">
      <div className="review-head">
        {heading && <Link href={heading.href} className="review-show">{heading.text}</Link>}
        <RatingStars value={r.rating} />
        <span className="muted review-meta">
          {formatDay(r.watched_at)}{r.watch_time ? ` ${r.watch_time}` : ""} 관람{author !== undefined && ` · ${author ?? "알 수 없음"}`}
        </span>
        {!r.is_public && <span className="badge badge-muted">나만 보기</span>}
      </div>
      {r.body && <p className="review-body">{r.body}</p>}
      {(r.cast_note || r.seat_text) && (
        <p className="review-extra muted">{[r.cast_note && `캐스트 ${r.cast_note}`, r.seat_text && `좌석 ${r.seat_text}`].filter(Boolean).join(" · ")}</p>
      )}
      {mine && (
        <div className="review-actions">
          <Link href={`/me/reviews/${r.id}/edit`} className="btn btn-text">수정</Link>
          <DeleteReviewButton id={r.id} />
        </div>
      )}
    </article>
  );
}
