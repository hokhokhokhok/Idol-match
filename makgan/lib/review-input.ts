// 후기 입력 검증(서버 액션·단위 테스트 공용)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REVIEW_LIMITS = { body: 2000, cast_note: 200, seat_text: 50, price: 10_000_000 } as const;

export type ReviewInput = {
  show_id: string;
  watched_at: string;
  watch_time: string | null;
  rating: number;
  body: string | null;
  cast_note: string | null;
  seat_text: string | null;
  price: number | null;
  is_public: boolean;
};

const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

/** FormData → 검증된 입력. 문제가 있으면 { error } (첫 문제 하나만) */
export function parseReviewForm(form: FormData, todayKst: string): { value: ReviewInput } | { error: string } {
  const show_id = String(form.get("show_id") ?? "");
  const watched_at = String(form.get("watched_at") ?? "");
  const watch_time = text(form.get("watch_time"));
  const rating = Number(form.get("rating"));
  const body = text(form.get("body"));
  const cast_note = text(form.get("cast_note"));
  const seat_text = text(form.get("seat_text"));
  const priceRaw = text(form.get("price"));
  const price = priceRaw === null ? null : Number(priceRaw.replace(/[,\s원]/g, ""));

  if (!UUID_RE.test(show_id)) return { error: "공연을 골라 주세요" };
  if (!DAY_RE.test(watched_at) || Number.isNaN(Date.parse(watched_at))) return { error: "관람일을 입력해 주세요" };
  if (watch_time && !TIME_RE.test(watch_time)) return { error: "회차 시간을 다시 입력해 주세요" };
  if (watched_at > todayKst) return { error: "관람일은 오늘까지만 입력할 수 있어요" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "별점을 골라 주세요" };
  if (body && body.length > REVIEW_LIMITS.body) return { error: `후기는 ${REVIEW_LIMITS.body}자까지 쓸 수 있어요` };
  if (cast_note && cast_note.length > REVIEW_LIMITS.cast_note) return { error: `캐스트 메모는 ${REVIEW_LIMITS.cast_note}자까지예요` };
  if (seat_text && seat_text.length > REVIEW_LIMITS.seat_text) return { error: `좌석은 ${REVIEW_LIMITS.seat_text}자까지예요` };
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > REVIEW_LIMITS.price)) return { error: "관람료는 숫자로 입력해 주세요" };

  return { value: { show_id, watched_at, watch_time, rating, body, cast_note, seat_text, price, is_public: form.get("is_public") === "on" } };
}
