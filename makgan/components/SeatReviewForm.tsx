"use client";
import { useActionState, useState } from "react";
import RatingInput from "./RatingInput";
import type { SeatFormState } from "@/lib/actions/seat-reviews";

type Zone = { id: string; floor: string; name: string };

/** 좌석 후기: 층 → 구역(없으면 자유 입력) → 열/번호 → 시야·거리·음향 → 시야 방해 → 코멘트 → 관람 공연(SPEC-2 B-1) */
export default function SeatReviewForm({
  action, zones, floors, shows, initial, today,
}: {
  action: (s: SeatFormState, f: FormData) => Promise<SeatFormState>;
  zones: Zone[];
  floors: string[];
  shows: { id: string; title: string }[];
  initial: Record<string, string>;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = { ...initial, ...state.values };
  const [floor, setFloor] = useState(v.floor && floors.includes(v.floor) ? v.floor : floors[0]);
  const [obstructed, setObstructed] = useState(v.is_obstructed === "on");
  const floorZones = zones.filter((z) => z.floor === floor);

  return (
    <form action={formAction} className="form" key={JSON.stringify(state.values ?? {})}>
      {v.review_id && <input type="hidden" name="review_id" value={v.review_id} />}
      <label className="field">
        <span>층</span>
        <select name="floor" value={floor} onChange={(e) => setFloor(e.target.value)} required>
          {floors.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      {floorZones.length > 0 ? (
        <label className="field">
          <span>구역</span>
          <select name="zone_id" required defaultValue={floorZones.some((z) => z.id === v.zone_id) ? v.zone_id : ""} key={floor}>
            <option value="" disabled>구역을 골라 주세요</option>
            {floorZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
      ) : (
        <label className="field">
          <span>구역 이름</span>
          <input name="zone_text" required maxLength={50} defaultValue={v.zone_text ?? ""} placeholder="예: 가운데, 오른쪽 끝" />
          <small className="form-hint">이 층은 구역 정보가 아직 없어 직접 적어요</small>
        </label>
      )}
      <div className="field-row">
        <label className="field"><span>열</span><input name="seat_row" maxLength={10} defaultValue={v.seat_row ?? ""} placeholder="예: 5 또는 E" /></label>
        <label className="field"><span>번호</span><input name="seat_number" maxLength={10} defaultValue={v.seat_number ?? ""} placeholder="예: 12" /></label>
      </div>
      <RatingInput name="view_score" label="시야" defaultValue={v.view_score ? Number(v.view_score) : undefined} />
      <RatingInput name="distance_score" label="거리" defaultValue={v.distance_score ? Number(v.distance_score) : undefined} />
      <RatingInput name="sound_score" label="음향" defaultValue={v.sound_score ? Number(v.sound_score) : undefined} />
      <label className="check">
        <input type="checkbox" name="is_obstructed" checked={obstructed} onChange={(e) => setObstructed(e.target.checked)} />
        <span>시야 방해가 있었어요 <small className="muted">(기둥·난간·앞사람 등)</small></span>
      </label>
      {obstructed && (
        <label className="field"><span>어떤 방해였나요?</span><input name="obstruction_note" maxLength={200} defaultValue={v.obstruction_note ?? ""} /></label>
      )}
      <label className="field"><span>코멘트</span><textarea name="comment" rows={4} maxLength={1000} defaultValue={v.comment ?? ""} placeholder="무대가 어떻게 보였나요?" /></label>
      <div className="field-row">
        <label className="field">
          <span>관람 공연(선택)</span>
          <select name="show_id" defaultValue={v.show_id ?? ""}>
            <option value="">선택 안 함</option>
            {shows.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label className="field"><span>관람일(선택)</span><input type="date" name="watched_at" max={today} defaultValue={v.watched_at ?? ""} /></label>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "저장 중…" : "좌석 후기 올리기"}</button>
    </form>
  );
}
