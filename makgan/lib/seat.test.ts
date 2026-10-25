import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeatReviewForm, rowBand } from "./seat.ts";

test("열 구간", () => {
  assert.equal(rowBand("1"), "front");
  assert.equal(rowBand("5열"), "front");
  assert.equal(rowBand("6"), "middle");
  assert.equal(rowBand("12"), "middle");
  assert.equal(rowBand("13"), "back");
  assert.equal(rowBand("a"), "front");
  assert.equal(rowBand("F"), "middle");
  assert.equal(rowBand("M"), "back");
  assert.equal(rowBand("AA"), "back");
  assert.equal(rowBand(""), null);
  assert.equal(rowBand("OP석"), null);
  assert.equal(rowBand("0"), null);
});

const ZONE = "00000000-0000-4000-8000-000000000901";
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ floor: "1층", zone_id: ZONE, view_score: "4", distance_score: "3", sound_score: "5", ...o })) f.set(k, v);
  return f;
};

test("좌석 후기: 정상, 구역을 고르면 자유 입력 무시, 시야 방해 없으면 메모 무시", () => {
  const r = parseSeatReviewForm(form({ zone_text: "무시", seat_row: " 5 ", obstruction_note: "기둥" }), "2026-11-03");
  assert.ok("value" in r);
  assert.equal(r.value.zone_text, null);
  assert.equal(r.value.seat_row, "5");
  assert.equal(r.value.obstruction_note, null);
});

test("좌석 후기: 구역 없는 극장은 자유 입력 구역", () => {
  const r = parseSeatReviewForm(form({ zone_id: "", zone_text: "오른쪽 끝", is_obstructed: "on", obstruction_note: "난간" }), "2026-11-03");
  assert.ok("value" in r && r.value.zone_id === null && r.value.zone_text === "오른쪽 끝" && r.value.obstruction_note === "난간");
});

test("좌석 후기: 잘못된 값", () => {
  const err = (o: Record<string, string>) => {
    const r = parseSeatReviewForm(form(o), "2026-11-03");
    return "error" in r ? r.error : null;
  };
  assert.equal(err({ floor: "" }), "층을 골라 주세요");
  assert.equal(err({ zone_id: "", zone_text: "" }), "구역을 골라 주세요");
  assert.equal(err({ zone_id: "x" }), "구역을 다시 골라 주세요");
  assert.match(err({ sound_score: "0" })!, /모두/);
  assert.match(err({ seat_row: "12345678901" })!, /10자/);
  assert.match(err({ watched_at: "2026-11-04" })!, /오늘까지/);
});
