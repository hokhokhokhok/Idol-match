// 실행: node jomun/tests/schedule.test.js  (또는 node --test jomun/tests/)
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

const T = "2026-10-23";
const item = (o = {}) => ({ id: "x", grade: "A", box: 0, due: T, log: [], ...o });

test("간격 = min(박스 간격, 등급 상한), 최소 1일", () => {
  assert.deepEqual(C.BOX.map(b => C.interval(C.BOX.indexOf(b), "D")), [1, 1, 2, 4, 7, 14, 14]);
  // 박스별로 등급 상한 확인
  for (let box = 0; box < C.BOX.length; box++) {
    for (const g of "ABCD") assert.equal(C.interval(box, g), Math.max(1, Math.min(C.BOX[box], C.GMAX[g])), `box ${box} ${g}`);
  }
  assert.equal(C.interval(6, "A"), 2);
  assert.equal(C.interval(6, "B"), 4);
  assert.equal(C.interval(6, "C"), 7);
  assert.equal(C.interval(6, "D"), 14);
  assert.equal(C.interval(0, "D"), 1);
  // 범위 밖 박스·모르는 등급도 안전하게
  assert.equal(C.interval(99, "C"), 7);
  assert.equal(C.interval(-3, "B"), 1);
  assert.equal(C.interval(6, "Z"), 14);
});

test("알았다: 박스 +1, 최대 6에서 멈춤, 다음 복습일 = 오늘 + 간격", () => {
  const it = item({ grade: "D" });
  const dues = [];
  for (let n = 0; n < 8; n++) { assert.equal(C.rate(it, 2, T).again, false); dues.push([it.box, it.due]); }
  assert.deepEqual(dues.map(d => d[0]), [1, 2, 3, 4, 5, 6, 6, 6]);
  assert.deepEqual(dues.map(d => C.diffDays(T, d[1])), [1, 2, 4, 7, 14, 14, 14, 14]);
});

test("등급 상한: A급은 박스가 높아도 2일 넘게 미루지 않는다", () => {
  const it = item({ grade: "A", box: 5 });
  C.rate(it, 2, T);
  assert.equal(it.box, 6);
  assert.equal(it.due, "2026-10-25");
  const c = item({ grade: "C", box: 5 });
  C.rate(c, 2, T);
  assert.equal(c.due, "2026-10-30");
});

test("애매: 박스 유지, 현재 박스 간격으로 다시", () => {
  const it = item({ grade: "D", box: 4 });
  C.rate(it, 1, T);
  assert.equal(it.box, 4);
  assert.equal(C.diffDays(T, it.due), 7);
});

test("몰랐다: 박스 -2(0 아래로 안 내려감), 세션 내 재출제, 다음 날 대기", () => {
  const it = item({ grade: "B", box: 5 });
  assert.equal(C.rate(it, 0, T).again, true);
  assert.equal(it.box, 3);
  assert.equal(it.due, "2026-10-24");
  const low = item({ box: 1 });
  C.rate(low, 0, T);
  assert.equal(low.box, 0);
});

test("평가 기록은 최근 30개만 보관", () => {
  const it = item();
  for (let n = 0; n < 40; n++) C.rate(it, n % 3, C.addDays(T, n));
  assert.equal(it.log.length, C.LOG_MAX);
  assert.equal(it.log[it.log.length - 1].d, C.addDays(T, 39));
});

test("재출제: 현재 카드를 큐 맨 뒤로", () => {
  assert.deepEqual(C.requeue(["a", "b", "c"], 0), ["b", "c", "a"]);
  assert.deepEqual(C.requeue(["a", "b", "c"], 1), ["a", "c", "b"]);
});

test("오늘 대기 정렬: 등급 A 우선 → 낮은 박스 → 오래 밀린 것, 미래 due 제외", () => {
  const items = [
    { id: "c3", grade: "C", box: 0, due: "2026-10-01" },
    { id: "a2", grade: "A", box: 2, due: T },
    { id: "a0new", grade: "A", box: 0, due: T },
    { id: "a0old", grade: "A", box: 0, due: "2026-10-20" },
    { id: "b1", grade: "B", box: 1, due: "2026-10-22" },
    { id: "future", grade: "A", box: 0, due: "2026-10-24" },
  ];
  assert.deepEqual(C.dueItems(items, T).map(i => i.id), ["a0old", "a0new", "a2", "b1", "c3"]);
});

test("날짜 계산: 월·연 경계", () => {
  assert.equal(C.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(C.addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(C.diffDays("2026-10-23", "2027-01-01"), 70);
  assert.equal(C.todayKST(Date.parse("2026-10-23T15:30:00Z")), "2026-10-24"); // UTC 15:30 = KST 다음 날 00:30
  assert.equal(C.isDate("2026-02-30"), false);
  assert.equal(C.isDate("2026-02-28"), true);
});
