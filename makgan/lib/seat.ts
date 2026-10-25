// 좌석 후기 입력 검증·열 구간(서버 액션·단위 테스트 공용)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RowBand = "front" | "middle" | "back";
export const ROW_BAND_LABEL: Record<RowBand, string> = { front: "앞열", middle: "중간", back: "뒷열" };

/** 열 → 앞열/중간/뒷열. 숫자 열 1–5/6–12/13+, 알파벳 열 A–E/F–L/M+. 판단 불가면 null */
export function rowBand(seatRow: string | null | undefined): RowBand | null {
  const s = (seatRow ?? "").trim().replace(/열$/, "").toUpperCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n < 1) return null;
    return n <= 5 ? "front" : n <= 12 ? "middle" : "back";
  }
  if (/^[A-Z]{1,2}$/.test(s)) {
    if (s.length === 2) return "back";
    const c = s.charCodeAt(0) - 64; // A=1
    return c <= 5 ? "front" : c <= 12 ? "middle" : "back";
  }
  return null;
}

export type SeatReviewInput = {
  floor: string;
  zone_id: string | null;
  zone_text: string | null;
  seat_row: string | null;
  seat_number: string | null;
  view_score: number;
  distance_score: number;
  sound_score: number;
  is_obstructed: boolean;
  obstruction_note: string | null;
  comment: string | null;
  show_id: string | null;
  watched_at: string | null;
  review_id: string | null;
};

const text = (v: FormDataEntryValue | null, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s.length > max ? undefined : s;
};
const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export function parseSeatReviewForm(form: FormData, todayKst: string): { value: SeatReviewInput } | { error: string } {
  const floor = text(form.get("floor"), 20);
  const zoneRaw = String(form.get("zone_id") ?? "");
  const zone_text = text(form.get("zone_text"), 50);
  const seat_row = text(form.get("seat_row"), 10);
  const seat_number = text(form.get("seat_number"), 10);
  const obstruction_note = text(form.get("obstruction_note"), 200);
  const comment = text(form.get("comment"), 1000);
  const showRaw = String(form.get("show_id") ?? "");
  const reviewRaw = String(form.get("review_id") ?? "");
  const watched_at = String(form.get("watched_at") ?? "") || null;
  const view_score = score(form.get("view_score"));
  const distance_score = score(form.get("distance_score"));
  const sound_score = score(form.get("sound_score"));

  if (!floor) return { error: "층을 골라 주세요" };
  if (zoneRaw && !UUID_RE.test(zoneRaw)) return { error: "구역을 다시 골라 주세요" };
  if (!zoneRaw && zone_text === null) return { error: "구역을 골라 주세요" };
  if (zone_text === undefined) return { error: "구역 이름은 50자까지예요" };
  if (seat_row === undefined || seat_number === undefined) return { error: "열·번호는 10자까지예요" };
  if (!view_score || !distance_score || !sound_score) return { error: "시야·거리·음향 점수를 모두 골라 주세요" };
  if (obstruction_note === undefined) return { error: "시야 방해 메모는 200자까지예요" };
  if (comment === undefined) return { error: "코멘트는 1000자까지예요" };
  if (showRaw && !UUID_RE.test(showRaw)) return { error: "공연을 다시 골라 주세요" };
  if (watched_at && (!DAY_RE.test(watched_at) || watched_at > todayKst)) return { error: "관람일은 오늘까지만 입력할 수 있어요" };

  const is_obstructed = form.get("is_obstructed") === "on";
  return {
    value: {
      floor, zone_id: zoneRaw || null, zone_text: zoneRaw ? null : zone_text, seat_row, seat_number,
      view_score, distance_score, sound_score, is_obstructed, obstruction_note: is_obstructed ? obstruction_note : null,
      comment, show_id: showRaw || null, watched_at, review_id: UUID_RE.test(reviewRaw) ? reviewRaw : null,
    },
  };
}
