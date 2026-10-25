import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewCasts } from "./review-casts.ts";

const A = "00000000-0000-4000-8000-000000000301";

test("빈 값, 정상, 중복 제거, 이름은 버림", () => {
  assert.deepEqual(parseReviewCasts(null), { value: [] });
  assert.deepEqual(parseReviewCasts(""), { value: [] });
  const r = parseReviewCasts(JSON.stringify([{ actor_id: A, role_name: " 주인공 ", name: "가" }, { actor_id: A, role_name: "주인공" }]));
  assert.deepEqual(r, { value: [{ actor_id: A, role_name: "주인공" }] });
});

test("조작된 값 거부", () => {
  for (const raw of ["{", "{}", JSON.stringify([{ actor_id: "x", role_name: "a" }]), JSON.stringify([{ actor_id: A, role_name: "" }]),
    JSON.stringify([{ actor_id: A, role_name: "가".repeat(101) }])]) {
    assert.ok("error" in parseReviewCasts(raw), raw);
  }
  const many = Array.from({ length: 21 }, (_, i) => ({ actor_id: A, role_name: `역${i}` }));
  assert.match((parseReviewCasts(JSON.stringify(many)) as { error: string }).error, /20명/);
});
