import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewForm } from "./review-input.ts";

const SHOW = "00000000-0000-4000-8000-000000000201";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ show_id: SHOW, watched_at: "2026-11-01", rating: "4", ...o })) f.set(k, v);
  return f;
};

test("정상 입력", () => {
  const r = parseReviewForm(form({ body: "  좋았다 ", price: "99,000원", is_public: "on" }), "2026-11-03");
  assert.deepEqual(r, { value: { show_id: SHOW, watched_at: "2026-11-01", rating: 4, body: "좋았다", cast_note: null, seat_text: null, price: 99000, is_public: true } });
});

test("빈 칸은 null, 체크 안 하면 비공개", () => {
  const r = parseReviewForm(form({ body: "   " }), "2026-11-03");
  assert.ok("value" in r && r.value.body === null && r.value.is_public === false);
});

test("잘못된 값", () => {
  const err = (o: Record<string, string>) => {
    const r = parseReviewForm(form(o), "2026-11-03");
    return "error" in r ? r.error : null;
  };
  assert.equal(err({ show_id: "x" }), "공연을 골라 주세요");
  assert.equal(err({ watched_at: "" }), "관람일을 입력해 주세요");
  assert.equal(err({ watched_at: "2026-11-04" }), "관람일은 오늘까지만 입력할 수 있어요");
  assert.equal(err({ rating: "0" }), "별점을 골라 주세요");
  assert.equal(err({ rating: "4.5" }), "별점을 골라 주세요");
  assert.equal(err({ rating: "6" }), "별점을 골라 주세요");
  assert.equal(err({ price: "-1" }), "관람료는 숫자로 입력해 주세요");
  assert.equal(err({ price: "abc" }), "관람료는 숫자로 입력해 주세요");
  assert.match(err({ body: "가".repeat(2001) })!, /2000자/);
});
