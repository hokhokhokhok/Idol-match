import test from "node:test";
import assert from "node:assert/strict";
import { assignTiers, scoreOf, isTier, type Activity } from "./popularity.ts";

const act = (id: string, o: Partial<Activity> = {}): Activity => ({ actor_id: id, shows: 1, recent: 0, followers: 0, reviews: 0, news: 0, ...o });

test("활동이 많을수록 점수가 높다", () => {
  assert.ok(scoreOf(act("a", { shows: 10, recent: 3, followers: 20 })) > scoreOf(act("b")));
  assert.ok(scoreOf(act("a", { news: 500 })) > scoreOf(act("a", { news: 0 })));
});

test("상위 2%는 S, 그 뒤 A·B·C, 나머지 D", () => {
  const list = Array.from({ length: 100 }, (_, i) => act(`x${String(i).padStart(3, "0")}`, { shows: 100 - i }));
  const t = assignTiers(list);
  const count = (k: string) => [...t.values()].filter((v) => v === k).length;
  assert.deepEqual(["S", "A", "B", "C", "D"].map(count), [2, 8, 20, 30, 40]);
  assert.equal(t.get("x000"), "S");
  assert.equal(t.get("x099"), "D");
});

test("동점은 같은 등급, 한 명뿐이어도 동작", () => {
  const t = assignTiers([act("a"), act("b"), act("c")]);
  assert.equal(new Set(t.values()).size, 1);
  assert.equal(assignTiers([act("only")]).get("only"), "S");
  assert.equal(assignTiers([]).size, 0);
});

test("isTier", () => { assert.ok(isTier("S") && !isTier("Z") && !isTier(undefined)); });
