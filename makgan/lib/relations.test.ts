import test from "node:test";
import assert from "node:assert/strict";
import { buildRelations, zoomAt, clampZoom, MAX_NODES } from "./relations.ts";

const names = new Map([
  ["c", { name: "중심" }], ["a", { name: "가" }], ["b", { name: "나" }], ["d", { name: "다" }], ["z", { name: "무관" }],
]);
const rows = [
  { actor_id: "c", show_id: "s1" }, { actor_id: "c", show_id: "s2" },
  { actor_id: "a", show_id: "s1" }, { actor_id: "a", show_id: "s2" },
  { actor_id: "b", show_id: "s1" }, { actor_id: "b", show_id: "s2" },
  { actor_id: "d", show_id: "s2" },
  { actor_id: "z", show_id: "s9" },
];

test("함께한 공연 수로 정렬하고 무관한 배우는 제외", () => {
  const g = buildRelations("c", "중심", rows, names);
  assert.deepEqual(g.nodes.map((n) => [n.name, n.weight]), [["가", 2], ["나", 2], ["다", 1]]);
  assert.equal(g.total, 3);
  assert.ok(!g.nodes.some((n) => n.id === "z" || n.id === "c"));
});

test("두 편 이상 함께한 이웃끼리만 선으로 잇는다", () => {
  const g = buildRelations("c", "중심", rows, names);
  assert.deepEqual(g.edges, [{ a: "a", b: "b", weight: 2 }]);
});

test("노드 수 제한과 원형 좌표", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ actor_id: `x${i}`, show_id: "s1" }));
  const nm = new Map(many.map((r) => [r.actor_id, { name: `배우${String(r.actor_id).padStart(4, "0")}` }]));
  const g = buildRelations("c", "중심", [{ actor_id: "c", show_id: "s1" }, ...many], nm);
  assert.equal(g.nodes.length, MAX_NODES);
  assert.equal(g.total, 50);
  const inner = g.nodes.slice(0, 10).map((n) => Math.hypot(n.x, n.y));
  assert.ok(inner.every((d) => Math.abs(d - 150) < 0.1));
});

test("줌은 범위 안이고 기준점이 고정된다", () => {
  assert.equal(clampZoom(99), 4);
  assert.equal(clampZoom(0.01), 0.5);
  const t = zoomAt({ x: 10, y: 20, k: 1 }, 2, 100, 100);
  assert.equal(t.k, 2);
  assert.equal((100 - t.x) / t.k, (100 - 10) / 1);
  assert.equal((100 - t.y) / t.k, (100 - 20) / 1);
});
