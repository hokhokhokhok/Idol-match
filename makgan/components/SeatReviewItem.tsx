"use client";
import ToggleButton from "./ToggleButton";
import DeleteButton from "./admin/DeleteButton";
import { toggleHelpful, deleteSeatReview } from "@/lib/actions/seat-reviews";
import { formatDay } from "@/lib/date";
import type { SeatReview } from "@/lib/data/seat-reviews";

export default function SeatReviewItem({ r, zoneName }: { r: SeatReview; zoneName?: string }) {
  const seat = [r.floor, zoneName ?? r.zone_text, r.seat_row && `${r.seat_row.replace(/열$/, "")}열`, r.seat_number && `${r.seat_number.replace(/번$/, "")}번`].filter(Boolean).join(" · ");
  const base = r.helpful_count - (r.helped ? 1 : 0);
  return (
    <article className="seat-review">
      <div className="seat-review-head">
        <strong>{seat || "좌석 정보 없음"}</strong>
        {r.is_obstructed && <span className="badge badge-warn">시야 방해</span>}
      </div>
      <p className="seat-scores muted">시야 {r.view_score} · 거리 {r.distance_score} · 음향 {r.sound_score}</p>
      {r.is_obstructed && r.obstruction_note && <p className="seat-note">⚠️ {r.obstruction_note}</p>}
      {r.comment && <p className="review-body">{r.comment}</p>}
      <p className="review-extra muted">{[r.show?.title, r.watched_at && `${formatDay(r.watched_at)} 관람`].filter(Boolean).join(" · ")}</p>
      <div className="seat-actions">
        {r.mine ? (
          <>
            <span className="muted helpful-count">도움돼요 {r.helpful_count}</span>
            <DeleteButton action={() => deleteSeatReview(r.id)} confirmText="이 좌석 후기를 삭제할까요?" />
          </>
        ) : (
          <ToggleButton
            on={r.helped}
            action={() => toggleHelpful(r.id)}
            labels={{ on: `👍 도움돼요 ${base + 1}`, off: `👍 도움돼요 ${base}`, aria: "도움돼요" }}
            className="btn btn-small helpful-btn"
          />
        )}
      </div>
    </article>
  );
}
