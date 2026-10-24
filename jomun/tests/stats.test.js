// 학습 기록·오답 노트·등급 점수·D-day·가져오기 검증
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

const T = "2026-10-23";

test("일일 기록과 정답률(알았다 비율)", () => {
  const days = {};
  [2, 2, 1, 0].forEach(r => C.record(days, T, r));
  assert.deepEqual(days[T], { n: 4, k: 2, a: 1, x: 1 });
  assert.equal(C.accuracy(days[T]), 50);
  assert.equal(C.accuracy(undefined), null);
});

test("연속 학습일: 오늘 안 했으면 어제까지 이어진 날 수", () => {
  const d = n => ({ n, k: 0, a: 0, x: 0 });
  const days = { "2026-10-20": d(3), "2026-10-21": d(1), "2026-10-22": d(5) };
  assert.equal(C.streak(days, T), 3);
  days[T] = d(2);
  assert.equal(C.streak(days, T), 4);
  assert.equal(C.streak({ "2026-10-21": d(1) }, T), 0);
  assert.equal(C.streak({}, T), 0);
});

test("오답 노트: 최근 7일(오늘 포함) 안의 '몰랐다'만, 많이 틀린 순", () => {
  const items = [
    { id: "old", log: [{ d: "2026-10-16", r: 0 }] },                       // 8일 전 → 제외
    { id: "edge", log: [{ d: "2026-10-17", r: 0 }] },                      // 6일 전 → 포함
    { id: "twice", log: [{ d: "2026-10-20", r: 0 }, { d: T, r: 0 }, { d: T, r: 2 }] },
    { id: "ok", log: [{ d: T, r: 2 }, { d: T, r: 1 }] },
  ];
  const w = C.wrongNotes(items, T);
  assert.deepEqual(w.map(x => [x.item.id, x.count, x.last]), [["twice", 2, T], ["edge", 1, "2026-10-17"]]);
});

test("등급 점수: PLAN.md 가중치 40/30/15/10/5 → 80↑A 60↑B 40↑C", () => {
  assert.equal(C.gradeScore({ freq: 10, need: 10, link: 10, mention: 10, diff: 10 }), 100);
  assert.equal(C.gradeScore({}), 0);
  assert.equal(C.gradeScore({ freq: 10 }), 40);
  assert.equal(C.gradeScore({ freq: 8, need: 9, link: 6, mention: 7, diff: 3 }), 32 + 27 + 9 + 7 + 1.5);
  assert.equal(C.gradeScore({ freq: 99, need: -5 }), 40); // 0~10 범위로 자름
  assert.deepEqual([80, 79.9, 60, 59.9, 40, 39.9, 0].map(C.scoreToGrade), ["A", "B", "B", "C", "C", "D", "D"]);
});

test("D-day 일일 한도 제안", () => {
  const items = [...Array(20)].map((_, i) => ({ grade: "A", log: i < 10 ? [{ d: T, r: 2 }] : [] }))
    .concat([...Array(28)].map(() => ({ grade: "D", log: [{ d: T, r: 2 }] })));
  // 정상 상태 = 20/2 + 28/14 = 12, 미학습 10개
  const far = C.capSuggestion(items, 200);
  assert.equal(far.steady, 12);
  assert.equal(far.cap, 15);                 // (12 + 10/200)×1 → 5 단위 올림
  assert.equal(C.capSuggestion(items, 60).cap, 15);  // (12+0.17)×1.2 = 14.6
  assert.equal(C.capSuggestion(items, 20).cap, 20);  // (12+0.5)×1.5 = 18.75
  assert.equal(C.capSuggestion(items, 5).cap, 30);   // (12+2)×2 = 28
  assert.equal(C.capSuggestion(items, 0), null);
  assert.equal(C.capSuggestion([], 100).cap, 5);     // 최소 5
});

const good = { id: "t-1", law: "토지보상법", article: "제1조", grade: "B", text: "가 {{나}} 다" };

test("가져오기: 정상 배열 → merge, verified 기본 false", () => {
  const r = C.validateImport([good]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "merge");
  assert.equal(r.items[0].verified, false);
  assert.ok(r.warnings.some(w => /원문 대조 필요/.test(w)));
  assert.equal(C.validateImport([{ ...good, verified: true }]).items[0].verified, true);
});

test("가져오기: 오류 메시지에 위치·필드·받은 값이 나온다", () => {
  const r = C.validateImport([good, { ...good, id: "t-2", grade: "E" }, { ...good, id: "t-3", text: "{{열림" }, { id: "t-4" }]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes("조문 2번째 (id: t-2)") && e.includes('"E"')));
  assert.ok(r.errors.some(e => e.includes("t-3") && e.includes("괄호 짝")));
  assert.ok(r.errors.some(e => e.includes("t-4") && e.includes("law")));
  assert.match(C.validateImport([good, good]).errors[0], /두 번/);
  assert.match(C.validateImport("x").errors[0], /배열 또는 객체/);
  assert.match(C.validateImport({ foo: 1 }).errors[0], /조문 배열이 없습니다/);
  assert.match(C.validateImport([{ ...good, verified: "yes" }]).errors[0], /verified/);
  assert.match(C.validateImport([{ ...good, due: "2026-13-01" }]).errors[0], /due/);
  assert.match(C.validateImport([{ ...good, text: "a {{}} b" }]).errors[0], /빈칸/);
});

test("가져오기: 연결 쟁점(chains) 검증, 없는 조문 id는 경고", () => {
  const r = C.validateImport({ items: [good], chains: [{ id: "c1", title: "쟁점", ids: ["t-1", "known", "nope"] }] }, ["known"]);
  assert.equal(r.ok, true);
  assert.equal(r.chains.length, 1);
  assert.ok(r.warnings.some(w => w.includes("nope") && !w.includes("known")));
  assert.match(C.validateImport({ chains: [{ id: "c", title: "t", ids: ["a"] }] }).errors[0], /2개 이상/);
  assert.match(C.validateImport({ chains: [{ id: "c", title: "t", ids: ["a", "a"] }] }).errors[0], /중복/);
});

test("백업 → 복원 왕복, 다른 앱·새 버전 백업 거부", () => {
  const state = C.migrate({ items: [{ ...good, box: 3, due: T, log: [{ d: T, r: 2 }] }], cap: 40 }, T);
  state.days[T] = { n: 1, k: 1, a: 0, x: 0 };
  state.examDate = "2027-06-01";
  const b = JSON.parse(JSON.stringify(C.backup(state)));
  const r = C.validateImport(b);
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(r.mode, "restore");
  assert.equal(r.state.items[0].box, 3);
  assert.equal(r.state.cap, 40);
  assert.equal(r.state.examDate, "2027-06-01");
  assert.deepEqual(r.state.days[T], { n: 1, k: 1, a: 0, x: 0 });
  assert.match(C.validateImport({ app: "other", state: {} }).errors[0], /이 앱의 백업/);
  assert.match(C.validateImport({ ...b, schema: 99 }).errors[0], /새 버전/);
  assert.match(C.validateImport({ ...b, state: { ...b.state, cap: "x" } }).errors[0], /cap/);
});

test("구버전(v1) 저장 상태 마이그레이션", () => {
  const s = C.migrate({ items: [{ ...good, box: 2, due: "2026-10-01", log: [] }, { ...good, id: "n", verified: true }], cap: 30 }, T);
  assert.equal(s.schema, C.SCHEMA);
  assert.deepEqual(s.days, {});
  assert.deepEqual(s.chains, []);
  assert.equal(s.items[0].verified, false);
  assert.equal(s.items[1].verified, true);
  assert.equal(s.items[1].due, T);
});

test("하루 조문 수: 예전 기본값 30은 10으로, 직접 바꾼 값과 새 백업의 값은 유지", () => {
  assert.equal(C.migrate({ items: [], cap: 30, schema: 2 }, T).cap, 10);
  assert.equal(C.migrate({ items: [] }, T).cap, 10);
  assert.equal(C.migrate({ items: [], cap: 25, schema: 2 }, T).cap, 25);
  assert.equal(C.migrate({ items: [], cap: 30, schema: 3 }, T).cap, 30);
  const s = C.migrate({ items: [{ ...good }], cap: 30, schema: 3 }, T);
  const r = C.validateImport(JSON.parse(JSON.stringify(C.backup(s))));
  assert.equal(C.migrate(r.state, T).cap, 30);
});

test("가져오기: 본문(text)이 빈 조문은 건너뛰고 채운 것만", () => {
  const r = C.validateImport([{ ...good, id: "e1", text: "" }, good]);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  assert.match(r.warnings[0], /1개는 건너뛰었습니다/);
  assert.match(C.validateImport([{ ...good, text: " " }]).errors[0], /모든 조문\(1개\)의 본문/);
});

test("기본 조문 팩: 형식 검증 통과, 모두 원문 대조 필요, 빈칸 있음, 샘플과 id 안 겹침, 연결 쟁점 id 모두 존재", () => {
  const pack = require("../data/pack.js");
  const seed = ["bosang-67-1", "bosang-67-2", "bosang-70-1"];
  assert.ok(Number.isInteger(pack.version) && pack.version >= 1);
  const r = C.validateImport({ items: pack.items, chains: pack.chains }, seed);
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.ok(pack.items.length >= 100);
  assert.ok(pack.items.every(i => i.verified === false && C.blanks(i.text).length > 0));
  assert.ok(!pack.items.some(i => seed.includes(i.id)));
  const all = new Set([...seed, ...pack.items.map(i => i.id)]);
  assert.ok(pack.chains.every(c => c.ids.every(id => all.has(id))), "연결 쟁점이 없는 조문을 가리킴");
  assert.ok(!r.warnings.some(w => w.includes("아직 없는 조문")));
  for (const law of ["토지보상법", "부동산공시법", "감정평가법", "행정기본법", "행정소송법", "행정절차법"])
    assert.ok(pack.items.some(i => i.law === law), law);
});
