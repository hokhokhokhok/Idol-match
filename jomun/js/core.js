/* 조문 암기 트레이너 — 화면과 무관한 순수 로직(스케줄·기록·등급 점수·가져오기 검증).
 브라우저에서는 window.Core, Node에서는 require("./core.js")로 쓴다. */
(function (root, factory) {
 const m = factory();
 if (typeof module === "object" && module.exports) module.exports = m; else root.Core = m;
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

const GRADES = "ABCD";
const GMAX = { A: 2, B: 4, C: 7, D: 14 };   // 등급별 최대 복습 간격(일)
const BOX = [1, 1, 2, 4, 7, 14, 30];        // 박스별 기본 간격(일)
const LOG_MAX = 30;                         // 조문별 평가 기록 보관 개수
const WEIGHTS = { freq: 40, need: 30, link: 15, mention: 10, diff: 5 }; // PLAN.md 5번(2. 등급 산정 점수)
const SCORE_LABELS = { freq: "기출 빈도", need: "답안 필수도", link: "쟁점 연결성", mention: "총평 언급", diff: "암기 난이도" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ===== 날짜 (모두 KST 기준 YYYY-MM-DD 문자열) ===== */
const todayKST = (now = Date.now()) => new Date(now + 9 * 36e5).toISOString().slice(0, 10);
function addDays(d, n) { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const diffDays = (from, to) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
const isDate = s => typeof s === "string" && DATE_RE.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && addDays(s, 0) === s;

/* ===== 텍스트 ===== */
const norm = s => String(s).replace(/[\s·ㆍ,.()「」]/g, "");
const parts = t => String(t).split(/\{\{(.+?)\}\}/g); // 홀수 인덱스 = 빈칸
const blanks = t => parts(t).filter((_, i) => i % 2);

/* ===== 스케줄 (라이트너 변형, PLAN.md 4번) ===== */
// 실제 간격 = min(박스 간격, 등급 최대 간격), 최소 1일
const interval = (box, grade) => Math.max(1, Math.min(BOX[Math.max(0, Math.min(BOX.length - 1, box | 0))], GMAX[grade] || GMAX.D));

// r: 0=몰랐다, 1=애매, 2=알았다. item을 바꾸고 세션 안에서 다시 낼지 돌려준다.
function rate(item, r, today) {
 item.log = (item.log || []).concat([{ d: today, r }]).slice(-LOG_MAX);
 if (r === 0) {
  item.box = Math.max(0, (item.box | 0) - 2);
  item.due = addDays(today, 1);       // 세션 안에서 재출제하고, 다음 날 다시 대기
  return { again: true };
 }
 if (r === 2) item.box = Math.min(BOX.length - 1, (item.box | 0) + 1);
 item.due = addDays(today, interval(item.box, item.grade));
 return { again: false };
}

// 세션 큐에서 i번째를 맨 뒤로 보낸다(재출제).
function requeue(q, i) { q.push(q.splice(i, 1)[0]); return q; }

// 오늘 대기: 이미 공부한 조문의 복습이 처음 보는 조문보다 먼저(새 조문을 많이 가져와도 복습이 밀리지 않게),
// 그 안에서 등급 A 우선 → 낮은 박스 우선 → 오래 밀린 것 우선
const isNew = i => !(i.log && i.log.length);
const byPriority = (a, b) => isNew(a) - isNew(b) || GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || (a.box | 0) - (b.box | 0) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
const dueItems = (items, today) => items.filter(i => i.due <= today).sort(byPriority);

/* ===== 하루 조문 수 ===== */
const DAILY = 10;                                                   // 하루 조문 수 기본값
// 오늘 한 번이라도 평가한 조문 수(재출제는 한 조문으로 센다)
const doneToday = (items, today) => items.filter(i => (i.log || []).some(l => l.d === today)).length;
// 오늘 낼 조문: 하루 목표(cap)에서 오늘 이미 한 조문 수를 뺀 만큼. more=true면 목표를 채운 뒤 '더 하기'로 cap개 더.
function todayQueue(items, today, cap, more = false) {
 const left = more ? cap : Math.max(0, cap - doneToday(items, today));
 return dueItems(items, today).slice(0, left);
}

/* ===== 학습 기록 ===== */
// days: { "YYYY-MM-DD": { n: 평가 수, k: 알았다, a: 애매, x: 몰랐다 } }
function record(days, today, r) {
 const d = days[today] || (days[today] = { n: 0, k: 0, a: 0, x: 0 });
 d.n++; d[["x", "a", "k"][r]]++;
 return d;
}
const accuracy = d => d && d.n ? Math.round(d.k / d.n * 100) : null;
// 오늘 아직 안 했으면 어제까지 이어진 연속일을 보여 준다(오늘 하면 이어짐).
function streak(days, today) {
 let d = days[today] && days[today].n ? today : addDays(today, -1), c = 0;
 while (days[d] && days[d].n > 0) { c++; d = addDays(d, -1); }
 return c;
}
// 최근 span일(오늘 포함) 안에 "몰랐다"를 받은 조문
function wrongNotes(items, today, span = 7) {
 const from = addDays(today, -(span - 1));
 return items.map(item => {
  const miss = (item.log || []).filter(l => l.r === 0 && l.d >= from && l.d <= today);
  return miss.length ? { item, count: miss.length, last: miss[miss.length - 1].d } : null;
 }).filter(Boolean).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

/* ===== 등급 점수 (PLAN.md 2번 가중치) ===== */
// 각 항목 0~10 → 0~100점
function gradeScore(s) {
 let t = 0;
 for (const k in WEIGHTS) t += clamp(+s[k] || 0, 0, 10) * WEIGHTS[k];
 return Math.round(t / 10 * 10) / 10;
}
const scoreToGrade = p => p >= 80 ? "A" : p >= 60 ? "B" : p >= 40 ? "C" : "D";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ===== D-day → 일일 한도 제안 ===== */
// 등급 상한 주기대로 전 범위를 돌리는 데 필요한 하루 평균량(Σ 1/등급최대간격)에
// 아직 한 번도 안 본 조문을 시험 전까지 나눠 넣는 양을 더하고, 시험이 가까울수록 여유를 더 둔다.
function capSuggestion(items, daysLeft) {
 if (!(daysLeft > 0)) return null;
 let steady = 0, unseen = 0;
 for (const i of items) { steady += 1 / (GMAX[i.grade] || GMAX.D); if (!(i.log && i.log.length)) unseen++; }
 const factor = daysLeft <= 7 ? 2 : daysLeft <= 30 ? 1.5 : daysLeft <= 90 ? 1.2 : 1;
 const phase = daysLeft <= 7 ? "직전 주 — 전 범위 압축 회독" : daysLeft <= 30 ? "막판 한 달 — 여유 50%" : daysLeft <= 90 ? "3개월 이내 — 여유 20%" : "장기 — 기본 분량";
 const raw = (steady + unseen / daysLeft) * factor;
 return { cap: clamp(Math.ceil(raw / 5) * 5, 5, 200), steady: Math.round(steady * 10) / 10, unseen, factor, phase };
}

/* ===== 가져오기 검증 ===== */
const APP = "jomun-trainer", SCHEMA = 3;
const isStr = v => typeof v === "string" && v.trim() !== "";
const show = v => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 40) + "…" : s; } catch (e) { return String(v); } };

function checkText(t, err) {
 if (!isStr(t)) return err("text(조문 본문)가 비어 있습니다");
 const open = (t.match(/\{\{/g) || []).length, close = (t.match(/\}\}/g) || []).length;
 if (open !== close) return err(`빈칸 괄호 짝이 맞지 않습니다 ({{ ${open}개, }} ${close}개)`);
 if (/\{\{\s*\}\}/.test(t)) return err("내용이 없는 빈칸 {{}} 이 있습니다");
 return true;
}

// 조문 1개 검증 → 정규화된 사본 또는 null. withState=true면 학습 상태(box/due/log)도 검사한다.
function checkItem(x, where, errors, warnings) {
 const err = m => { errors.push(`${where}: ${m}`); return false; };
 if (!x || typeof x !== "object" || Array.isArray(x)) { err("조문 객체가 아닙니다"); return null; }
 const n0 = errors.length;
 if (!isStr(x.id)) err("id가 없습니다");
 else if (x.id.length > 100) err("id가 너무 깁니다(100자 이하)");
 if (!isStr(x.law)) err("law(법령명)가 없습니다");
 if (!isStr(x.article)) err("article(조문 번호)가 없습니다");
 if (!(typeof x.grade === "string" && x.grade.length === 1 && GRADES.includes(x.grade))) err(`grade는 A·B·C·D 중 하나여야 합니다 (받은 값: ${show(x.grade)})`);
 checkText(x.text, err);
 if (x.title != null && typeof x.title !== "string") err("title은 문자열이어야 합니다");
 if (x.tags != null && !(Array.isArray(x.tags) && x.tags.every(t => typeof t === "string"))) err("tags는 문자열 배열이어야 합니다");
 if (x.source != null && (typeof x.source !== "object" || Array.isArray(x.source))) err("source는 객체여야 합니다 (예: {\"exams\":[\"제33회 1번\"],\"note\":\"…\"})");
 if (x.verified != null && typeof x.verified !== "boolean") err(`verified는 true/false여야 합니다 (받은 값: ${show(x.verified)})`);
 if (x.box != null && !(Number.isInteger(x.box) && x.box >= 0 && x.box < BOX.length)) err(`box는 0~${BOX.length - 1} 정수여야 합니다 (받은 값: ${show(x.box)})`);
 if (x.due != null && !isDate(x.due)) err(`due는 YYYY-MM-DD 날짜여야 합니다 (받은 값: ${show(x.due)})`);
 if (x.log != null && !(Array.isArray(x.log) && x.log.every(l => l && isDate(l.d) && [0, 1, 2].includes(l.r)))) err("log는 [{d:\"YYYY-MM-DD\", r:0|1|2}] 형식이어야 합니다");
 if (x.score != null) {
  if (typeof x.score !== "object" || Array.isArray(x.score)) err("score는 객체여야 합니다");
  else for (const k in WEIGHTS) if (x.score[k] != null && !(typeof x.score[k] === "number" && x.score[k] >= 0 && x.score[k] <= 10)) err(`score.${k}는 0~10 숫자여야 합니다`);
 }
 if (errors.length > n0) return null;
 if (!blanks(x.text).length) warnings.push(`${where}: 빈칸 {{ }} 이 없어 복습 때 입력칸이 나오지 않습니다`);
 if (x.verified !== true) warnings.push(`${where}: verified가 true가 아니어서 "원문 대조 필요"로 표시됩니다`);
 // 모르는 필드(메모 등)는 보존하고, verified는 명시적으로 true일 때만 true
 return { ...x, title: x.title || "", tags: x.tags || [], verified: x.verified === true };
}

function checkChain(c, where, errors) {
 const err = m => { errors.push(`${where}: ${m}`); return false; };
 if (!c || typeof c !== "object" || Array.isArray(c)) { err("연결 쟁점 객체가 아닙니다"); return null; }
 const n0 = errors.length;
 if (!isStr(c.id)) err("id가 없습니다");
 if (!isStr(c.title)) err("title(쟁점명)이 없습니다");
 if (!(Array.isArray(c.ids) && c.ids.length >= 2 && c.ids.every(isStr))) err("ids는 조문 id 문자열 2개 이상의 배열이어야 합니다");
 else if (new Set(c.ids).size !== c.ids.length) err("ids에 같은 조문이 중복돼 있습니다");
 if (c.verified != null && typeof c.verified !== "boolean") err("verified는 true/false여야 합니다");
 if (errors.length > n0) return null;
 return { ...c, note: c.note || "", verified: c.verified === true };
}

/* 가져오기 데이터 판별 + 검증.
 - 조문 배열 [ {...}, ... ]                   → mode "merge"
 - { items:[...], chains:[...] }              → mode "merge"
 - 전체 백업 { app:"jomun-trainer", state }   → mode "restore" (전체 교체)
 knownIds: 연결 쟁점이 가리키는 id를 확인할 때 함께 볼 기존 조문 id */
function validateImport(data, knownIds = []) {
 const errors = [], warnings = [];
 let mode = "merge", items = [], chains = [], state = null;
 const fail = m => ({ ok: false, mode, errors: [m], warnings: [] });
 if (data == null || typeof data !== "object") return fail("JSON 배열 또는 객체가 아닙니다");
 let src = data;
 if (!Array.isArray(data) && data.app != null) {
  if (data.app !== APP) return fail(`이 앱의 백업 파일이 아닙니다 (app: ${show(data.app)})`);
  if (!(data.schema <= SCHEMA)) return fail(`더 새 버전 앱의 백업입니다 (schema ${show(data.schema)}). 앱을 새로고침해 업데이트한 뒤 다시 시도하세요`);
  if (!data.state || typeof data.state !== "object") return fail("백업에 state가 없습니다");
  mode = "restore"; src = data.state;
 }
 const rawItems = Array.isArray(src) ? src : src.items == null && mode === "merge" && Array.isArray(src.chains) ? [] : src.items, rawChains = Array.isArray(src) ? [] : src.chains;
 if (!Array.isArray(rawItems)) return fail(mode === "restore" ? "백업의 state.items가 배열이 아닙니다" : "조문 배열이 없습니다 (배열 [...] 또는 {\"items\":[...]} 형식)");
 if (rawChains != null && !Array.isArray(rawChains)) return fail("chains는 배열이어야 합니다");
 const seen = new Set();
 let skipped = 0;
 rawItems.forEach((x, i) => {
  const where = `조문 ${i + 1}번째${x && isStr(x.id) ? ` (id: ${x.id})` : ""}`;
  // 템플릿에서 본문을 아직 안 채운 조문은 오류 대신 건너뛴다(채운 것만 들어감)
  if (x && typeof x.text === "string" && !x.text.trim()) { skipped++; return; }
  const it = checkItem(x, where, errors, warnings);
  if (!it) return;
  if (seen.has(it.id)) { errors.push(`${where}: 같은 id가 파일 안에 두 번 있습니다`); return; }
  seen.add(it.id); items.push(it);
 });
 const all = new Set(mode === "restore" ? seen : [...knownIds, ...seen]), cseen = new Set();
 (rawChains || []).forEach((c, i) => {
  const where = `연결 쟁점 ${i + 1}번째${c && isStr(c.id) ? ` (id: ${c.id})` : ""}`;
  const ch = checkChain(c, where, errors);
  if (!ch) return;
  if (cseen.has(ch.id)) { errors.push(`${where}: 같은 id가 파일 안에 두 번 있습니다`); return; }
  cseen.add(ch.id);
  const miss = ch.ids.filter(id => !all.has(id));
  if (miss.length) warnings.push(`${where}: 아직 없는 조문 id ${miss.join(", ")} — 해당 조문을 가져오기 전까지 "미등록"으로 표시됩니다`);
  chains.push(ch);
 });
 if (skipped) warnings.unshift(`본문(text)이 비어 있는 조문 ${skipped}개는 건너뛰었습니다 — law.go.kr 원문을 채운 뒤 다시 가져오세요`);
 if (!items.length && !chains.length && !errors.length) errors.push(skipped ? `모든 조문(${skipped}개)의 본문(text)이 비어 있습니다 — 조문 원문을 "text"에 채워 넣으세요` : "가져올 조문이나 연결 쟁점이 없습니다");
 if (mode === "restore" && !errors.length) {
  const s = src, days = {};
  if (s.days != null && (typeof s.days !== "object" || Array.isArray(s.days))) errors.push("백업의 days(학습 기록)가 객체가 아닙니다");
  else for (const d in s.days || {}) {
   const v = s.days[d];
   if (!isDate(d) || !v || !(Number.isInteger(v.n) && v.n >= 0)) { errors.push(`백업의 학습 기록 ${show(d)} 형식이 잘못됐습니다`); break; }
   days[d] = { n: v.n, k: v.k | 0, a: v.a | 0, x: v.x | 0 };
  }
  if (s.cap != null && !(Number.isInteger(s.cap) && s.cap >= 1 && s.cap <= 500)) errors.push(`백업의 cap(일일 한도)이 잘못됐습니다 (받은 값: ${show(s.cap)})`);
  if (s.examDate != null && s.examDate !== "" && !isDate(s.examDate)) errors.push(`백업의 examDate(시험일)가 날짜가 아닙니다 (받은 값: ${show(s.examDate)})`);
  state = { schema: data.schema, items, chains, days, cap: s.cap || DAILY, packVer: s.packVer | 0, examDate: s.examDate || "", chainLog: s.chainLog && typeof s.chainLog === "object" ? s.chainLog : {} };
 }
 return { ok: !errors.length, mode, items, chains, state, errors, warnings };
}

// 저장된 상태(구버전 포함)를 현재 형식으로 맞춘다.
function migrate(s, today) {
 // schema 3: 하루 조문 수 기본값 30 → 10. 예전 기본값(30)을 그대로 쓰던 경우만 바꾼다.
 if (!(s.schema >= 3) && (s.cap == null || s.cap === 30)) s.cap = DAILY;
 s.schema = SCHEMA;
 s.items = (s.items || []).map(i => ({ ...i, box: i.box | 0, due: isDate(i.due) ? i.due : today, log: Array.isArray(i.log) ? i.log : [], verified: i.verified === true }));
 s.chains = Array.isArray(s.chains) ? s.chains : [];
 s.days = s.days && typeof s.days === "object" ? s.days : {};
 s.chainLog = s.chainLog && typeof s.chainLog === "object" ? s.chainLog : {};
 s.cap = s.cap > 0 ? s.cap : DAILY;
 s.examDate = s.examDate || "";
 return s;
}

const backup = (state, now = new Date()) => ({ app: APP, schema: SCHEMA, exported: now.toISOString(), state });

return { GRADES, GMAX, BOX, LOG_MAX, WEIGHTS, SCORE_LABELS, APP, SCHEMA,
 todayKST, addDays, diffDays, isDate, norm, parts, blanks,
 interval, rate, requeue, isNew, dueItems, DAILY, doneToday, todayQueue, record, accuracy, streak, wrongNotes,
 gradeScore, scoreToGrade, capSuggestion, validateImport, migrate, backup };
});
