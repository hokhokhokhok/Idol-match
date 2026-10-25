"use client";
import { useActionState, useState } from "react";
import RatingInput from "./RatingInput";
import type { ReviewFormState } from "@/lib/actions/reviews";
import { REVIEW_LIMITS } from "@/lib/review-input";

type Values = Partial<Record<"id" | "show_id" | "watched_at" | "rating" | "body" | "cast_note" | "seat_text" | "price" | "is_public", string>>;

/** 관극 후기 작성·수정 폼 */
export default function ReviewForm({
  action, shows, initial, today, submitLabel,
}: {
  action: (s: ReviewFormState, f: FormData) => Promise<ReviewFormState>;
  shows: { id: string; title: string; theater_id?: string | null }[];
  initial: Values;
  today: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // 검증 실패로 돌아오면 입력값 유지(React가 폼을 비우므로 defaultValue로 되살림)
  const v: Values = { ...initial, ...state.values };
  const key = JSON.stringify(state.values ?? {});
  const [showId, setShowId] = useState(v.show_id ?? "");
  const [seat, setSeat] = useState(v.seat_text ?? "");
  const canShareSeat = !v.id && seat.trim() !== "" && Boolean(shows.find((s) => s.id === showId)?.theater_id);

  return (
    <form action={formAction} className="form" key={key}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <label className="field">
        <span>공연</span>
        <select name="show_id" required defaultValue={v.show_id ?? ""} onChange={(e) => setShowId(e.target.value)}>
          <option value="" disabled>공연을 골라 주세요</option>
          {shows.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>
      <label className="field">
        <span>관람일</span>
        <input type="date" name="watched_at" required max={today} defaultValue={v.watched_at ?? today} />
      </label>
      <RatingInput name="rating" defaultValue={v.rating ? Number(v.rating) : undefined} />
      <label className="field">
        <span>후기</span>
        <textarea name="body" rows={6} maxLength={REVIEW_LIMITS.body} defaultValue={v.body ?? ""} placeholder="어떤 점이 좋았나요?" />
      </label>
      <label className="field">
        <span>그날 캐스트 (메모)</span>
        <input name="cast_note" maxLength={REVIEW_LIMITS.cast_note} defaultValue={v.cast_note ?? ""} placeholder="예: 주인공 OOO, 조연 OOO" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>좌석</span>
          <input name="seat_text" maxLength={REVIEW_LIMITS.seat_text} defaultValue={v.seat_text ?? ""} placeholder="예: 1층 B구역 5열" onChange={(e) => setSeat(e.target.value)} />
        </label>
        <label className="field">
          <span>관람료(원)</span>
          <input name="price" inputMode="numeric" defaultValue={v.price ?? ""} placeholder="예: 99000" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="is_public" defaultChecked={v.is_public === "on" || v.is_public === "true"} />
        <span>공연 페이지에 공개하기 <small className="muted">(끄면 나만 봐요)</small></span>
      </label>
      {canShareSeat && (
        <label className="check">
          <input type="checkbox" name="seat_to_theater" />
          <span>이 좌석 후기도 극장 정보에 올릴까요? <small className="muted">(저장 후 좌석 후기 쓰기로 이어져요)</small></span>
        </label>
      )}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "저장 중…" : submitLabel}</button>
    </form>
  );
}
