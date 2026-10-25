import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats } from "./stats.ts";

const show = (id: string) => ({ id, title: `공연${id}` });
const reviews = [
  { id: "r1", watched_at: "2026-01-10", rating: 5, price: 100000, show: show("A") },
  { id: "r2", watched_at: "2026-01-20", rating: 3, price: null, show: show("A") },
  { id: "r3", watched_at: "2026-03-05", rating: 4, price: 50000, show: show("B") },
  { id: "r4", watched_at: "2025-12-31", rating: 1, price: 999, show: show("C") },
];

test("올해 횟수·지출·평균·월별·공연 TOP3", () => {
  const s = computeStats(reviews, [], 2026);
  assert.equal(s.count, 3);
  assert.equal(s.totalSpent, 150000);
  assert.equal(s.pricedCount, 2);
  assert.equal(s.avgRating, 4);
  assert.deepEqual(s.monthly.slice(0, 3), [2, 0, 1]);
  assert.deepEqual(s.topShows.map((x) => [x.id, x.count]), [["A", 2], ["B", 1]]);
  assert.equal(s.topActors, null, "구조화 캐스트 없으면 배우 TOP3 없음");
  assert.deepEqual(s.years, [2026, 2025]);
});

test("배우 TOP3: 구조화 캐스트만, 한 후기에서 두 배역이어도 1회, 다른 해 제외", () => {
  const casts = [
    { review_id: "r1", actor_id: "x", name: "가" },
    { review_id: "r1", actor_id: "x", name: "가" },
    { review_id: "r2", actor_id: "x", name: "가" },
    { review_id: "r2", actor_id: "y", name: "나" },
    { review_id: "r4", actor_id: "z", name: "다" },
  ];
  const s = computeStats(reviews, casts, 2026);
  assert.deepEqual(s.topActors!.map((a) => [a.id, a.count]), [["x", 2], ["y", 1]]);
});

test("기록 없는 해", () => {
  const s = computeStats(reviews, [], 2024);
  assert.equal(s.count, 0);
  assert.equal(s.avgRating, null);
  assert.deepEqual(s.monthly, Array(12).fill(0));
});
