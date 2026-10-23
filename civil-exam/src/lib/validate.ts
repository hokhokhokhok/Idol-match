/**
 * 문항 세트 검증 (scripts/validate-questions.ts 에서 실행, vitest로 테스트).
 * - error: 스키마 위반 — 앱이 깨지거나 채점이 틀어진다. 빌드를 막는다.
 * - warn: 기획안 7·10절의 분량·구성 기준 이탈 — 검수 때 확인. --strict 이면 error로 취급.
 * - info: 미검수·판례 미확인 등 진행 상황.
 *
 * Node가 이 파일을 직접 실행하므로 런타임 import 없이 타입만 가져온다.
 */
import type { Question, QuestionType, Unit } from '../types';

export type Level = 'error' | 'warn' | 'info';
export type Issue = { level: Level; where: string; message: string };

export type Blueprint = { total: number; jitter: number; units: Record<string, { count: number }> };

const UNITS: readonly Unit[] = ['총칙', '물권', '계약', '채권총론', '기타'];
const TYPES: readonly QuestionType[] = ['single', 'count', 'combo', 'case', 'precedent'];
const BOX_LABELS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];
const CIRCLED = /^\s*[①②③④⑤]|^\s*[1-5][.)]\s/;
const DISPUTE_NOTE = /\s*\(다툼이 있는 경우 판례에 따름\)\s*/g;

type Range = readonly [number, number];
/** 기획안 7절 분량 기준(공백 포함 글자 수, 마크업·"(다툼이 있는 경우 판례에 따름)" 제외) */
export const LENGTH_RULES: Record<
  QuestionType,
  { stem?: Range; facts?: Range; choice?: Range; boxItem?: Range; total: Range }
> = {
  single: { stem: [20, 40], choice: [50, 120], total: [300, 650] },
  combo: { stem: [20, 80], boxItem: [60, 130], total: [400, 700] },
  count: { stem: [20, 80], boxItem: [60, 130], total: [400, 700] },
  case: { facts: [200, 380], choice: [50, 130], total: [550, 900] },
  precedent: { stem: [20, 40], choice: [60, 130], total: [350, 650] },
};

/** 화면에 보이는 글자 수: 인라인 마크업 제거 후 코드포인트 수 */
export const visibleLength = (s: string) => [...s.replace(/\*\*|<\/?u>/g, '')].length;
const bodyLength = (s: string) => visibleLength(s.replace(DISPUTE_NOTE, ' ').trim());

/** 사례형 stem을 사실관계와 마지막 발문(물음표로 끝나는 문장)으로 나눈다 */
export function splitCase(stem: string): { facts: string; question: string } {
  const s = stem.replace(DISPUTE_NOTE, '').trim();
  const m = s.match(/^(.*[.。])\s*([^.。]*\?)$/s);
  return m ? { facts: m[1].trim(), question: m[2].trim() } : { facts: s, question: '' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/** **, <u></u> 짝과 허용되지 않은 태그 검사 */
function markupProblem(s: string): string | null {
  if ((s.match(/\*\*/g) ?? []).length % 2) return '** 짝이 맞지 않습니다';
  const open = (s.match(/<u>/g) ?? []).length;
  const close = (s.match(/<\/u>/g) ?? []).length;
  if (open !== close) return '<u> 짝이 맞지 않습니다';
  const other = s.replace(/<\/?u>/g, '').match(/<\/?[a-zA-Z][^>]*>/);
  if (other) return `허용되지 않은 태그 ${other[0]} (**굵게**, <u>밑줄</u>만 지원)`;
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 문항 1개 검사. setId는 파일 이름에서 온 값 */
export function validateQuestion(raw: unknown, setId: string, index: number): Issue[] {
  const issues: Issue[] = [];
  const where = isObj(raw) && isStr(raw.id) ? raw.id : `${setId}[${index}]`;
  const err = (message: string) => issues.push({ level: 'error', where, message });
  const warn = (message: string) => issues.push({ level: 'warn', where, message });
  const info = (message: string) => issues.push({ level: 'info', where, message });

  if (!isObj(raw)) {
    err('문항이 객체가 아닙니다');
    return issues;
  }
  const q = raw as Partial<Question> & Record<string, unknown>;

  // ── 기본 필드 ──
  if (!isStr(q.id)) err('id가 없습니다');
  if (q.setId !== setId) err(`setId "${String(q.setId)}"가 파일 이름 "${setId}"와 다릅니다`);
  if (!isInt(q.number, 1, 40)) err(`number는 1~40 정수여야 합니다 (현재 ${String(q.number)})`);
  else if (isStr(q.id) && q.id !== `${setId}-q${pad2(q.number!)}`)
    warn(`id는 "${setId}-q${pad2(q.number!)}" 형식을 권장합니다`);
  if (!UNITS.includes(q.unit as Unit)) err(`unit "${String(q.unit)}"은(는) ${UNITS.join('/')} 중 하나여야 합니다`);
  if (!isStr(q.topic)) err('topic이 비어 있습니다');
  if (!TYPES.includes(q.type as QuestionType)) err(`type "${String(q.type)}"은(는) ${TYPES.join('/')} 중 하나여야 합니다`);
  if (!isStr(q.stem)) err('stem(발문)이 비어 있습니다');
  if (![1, 2, 3].includes(q.difficulty as number)) err('difficulty는 1, 2, 3 중 하나여야 합니다');
  if (q.source !== 'original') err('source는 "original"이어야 합니다 (기출·학원 문항 전재 금지)');
  if (typeof q.reviewed !== 'boolean') err('reviewed는 true/false여야 합니다');

  // ── 보기·정답 ──
  const choices = Array.isArray(q.choices) ? q.choices : null;
  if (!choices || choices.length !== 5) err(`choices는 5개여야 합니다 (현재 ${choices ? choices.length : '없음'})`);
  choices?.forEach((c, i) => {
    if (!isStr(c)) err(`${i + 1}번 보기가 비어 있습니다`);
    else if (CIRCLED.test(c)) err(`${i + 1}번 보기 앞의 번호 기호를 빼세요 (①~⑤는 화면이 붙입니다)`);
  });
  if (choices && new Set(choices.map((c) => String(c).trim())).size !== choices.length) err('같은 내용의 보기가 있습니다');
  if (!isInt(q.answer, 1, 5)) err(`answer는 1~5 정수여야 합니다 (현재 ${String(q.answer)})`);

  // ── 해설 ──
  const ex = q.explanation;
  if (!isObj(ex)) err('explanation이 없습니다');
  else {
    if (!isStr(ex.summary)) err('explanation.summary(핵심 한 줄)가 비어 있습니다');
    const per = Array.isArray(ex.perChoice) ? ex.perChoice : null;
    if (!per || per.length !== 5 || !per.every(isStr)) err('explanation.perChoice는 비어 있지 않은 5개여야 합니다');
    if (!Array.isArray(ex.statutes) || !ex.statutes.every(isStr)) err('explanation.statutes는 문자열 배열이어야 합니다');
    else if (ex.statutes.length === 0) warn('근거 조문(statutes)이 없습니다');
    if (ex.cases !== undefined) {
      if (!Array.isArray(ex.cases)) err('explanation.cases는 배열이어야 합니다');
      else
        ex.cases.forEach((c, i) => {
          if (!isObj(c) || !isStr(c.gist) || typeof c.verified !== 'boolean')
            err(`cases[${i}]는 gist(문자열)와 verified(true/false)가 필요합니다`);
          else if (c.citation !== undefined && !isStr(c.citation)) err(`cases[${i}].citation은 문자열이어야 합니다`);
          else if (!c.verified) info(`판례 미확인: ${c.gist.slice(0, 30)}…`);
        });
    }
  }

  // ── 해설과 정답의 일치: '…정답.'으로 끝나는 보기 해설이 정답 번호와 같아야 한다 ──
  if (isObj(ex) && Array.isArray(ex.perChoice) && ex.perChoice.length === 5 && isInt(q.answer, 1, 5)) {
    const marked = (ex.perChoice as unknown[]).flatMap((p, i) => (typeof p === 'string' && /정답\.?\s*$/.test(p) ? [i + 1] : []));
    if (marked.length && (marked.length > 1 || marked[0] !== q.answer))
      warn(`보기별 해설에서 정답으로 설명한 보기(${marked.join(', ')}번)가 answer(${String(q.answer)}번)와 다릅니다`);
  }

  // ── 마크업 ──
  const texts: [string, unknown][] = [['stem', q.stem], ...(choices ?? []).map((c, i) => [`${i + 1}번 보기`, c] as [string, unknown])];
  if (isObj(q.box) && Array.isArray(q.box.items)) q.box.items.forEach((it, i) => texts.push([`박스 ${i + 1}`, isObj(it) ? it.text : '']));
  for (const [label, t] of texts) {
    const p = typeof t === 'string' ? markupProblem(t) : null;
    if (p) err(`${label}: ${p}`);
  }

  // ── 유형별 구성 ──
  const type = q.type as QuestionType;
  const boxed = type === 'combo' || type === 'count';
  const items = isObj(q.box) && Array.isArray(q.box.items) ? q.box.items : null;
  if (boxed) {
    if (!items || items.length < 3) err('조합형·개수형은 box.items(ㄱ, ㄴ, ㄷ…)가 3개 이상 필요합니다');
    else {
      items.forEach((it, i) => {
        if (!isObj(it) || !isStr(it.text)) err(`box.items[${i}]의 text가 비어 있습니다`);
        else if (it.label !== BOX_LABELS[i]) err(`box.items[${i}]의 label은 "${BOX_LABELS[i]}"여야 합니다`);
      });
      if (type === 'combo' && choices) {
        const labels = new Set(items.map((it) => (isObj(it) ? it.label : '')));
        choices.forEach((c, i) => {
          const parts = String(c).split(/[,\s]+/).filter(Boolean);
          if (!parts.length || parts.some((p) => !labels.has(p)))
            err(`${i + 1}번 보기 "${c}"는 박스의 기호 조합(예: ㄱ, ㄷ)이어야 합니다`);
        });
        if (isStr(q.stem) && !/모두 고른 것은/.test(q.stem)) warn('조합형 발문에 "모두 고른 것은"이 없습니다');
      }
      if (type === 'count' && choices) {
        if (!choices.every((c) => /^(\d개|없음)$/.test(String(c).trim()))) warn('개수형 보기는 "1개", "2개"…/"없음" 형식을 권장합니다');
        if (isStr(q.stem) && !/몇 개/.test(q.stem)) warn('개수형 발문에 "몇 개"가 없습니다');
      }
    }
  } else if (q.box !== undefined) warn(`${type} 유형에 box가 있습니다 (조합형·개수형만 사용)`);
  if (type === 'precedent' && isStr(q.stem) && !/판례/.test(q.stem)) warn('판례형 발문에 "판례"가 없습니다');
  if (type === 'case' && isStr(q.stem) && !/[갑을병정]/.test(q.stem)) warn('사례형인데 갑·을·병 등장인물이 없습니다');

  // ── 분량 (7절) ──
  const rule = LENGTH_RULES[type];
  if (rule && isStr(q.stem) && choices && choices.every((c) => typeof c === 'string')) {
    const out = (label: string, n: number, [lo, hi]: Range) => {
      if (n < lo || n > hi) warn(`분량: ${label} ${n}자 (기준 ${lo}~${hi}자)`);
    };
    if (rule.stem) out('발문', bodyLength(q.stem), rule.stem);
    if (rule.facts) {
      const { facts, question } = splitCase(q.stem);
      out('사실관계', visibleLength(facts), rule.facts);
      if (!question) warn('사례형 stem 끝에 물음표로 끝나는 발문이 없습니다');
    }
    if (rule.choice) choices.forEach((c, i) => out(`${i + 1}번 보기`, visibleLength(c), rule.choice!));
    if (rule.boxItem && items) items.forEach((it) => isObj(it) && isStr(it.text) && out(`박스 ${String(it.label)}`, visibleLength(it.text), rule.boxItem!));
    const total =
      bodyLength(q.stem) +
      (items ?? []).reduce((s, it) => s + (isObj(it) && isStr(it.text) ? visibleLength(it.text) : 0), 0) +
      choices.reduce((s, c) => s + visibleLength(c), 0);
    out('문항 전체', total, rule.total);
  }

  if (q.reviewed === false) info('미검수 (reviewed: false)');
  return issues;
}

/** 세트 1개 검사: 문항별 검사 + 번호·id 중복, 40문항 배분, 정답 분포 */
export function validateSet(raw: unknown, setId: string, blueprint?: Blueprint): Issue[] {
  if (!Array.isArray(raw)) return [{ level: 'error', where: setId, message: '세트 파일은 문항 배열([...])이어야 합니다' }];
  const issues = raw.flatMap((q, i) => validateQuestion(q, setId, i));
  const set = (message: string, level: Level = 'warn') => issues.push({ level, where: setId, message });
  const qs = raw.filter(isObj) as Partial<Question>[];

  const dup = <T,>(vals: T[]) => [...new Set(vals.filter((v, i) => vals.indexOf(v) !== i))];
  const dupNo = dup(qs.map((q) => q.number).filter((n) => n !== undefined));
  if (dupNo.length) set(`번호가 중복됩니다: ${dupNo.join(', ')}`, 'error');
  const dupId = dup(qs.map((q) => q.id).filter(Boolean));
  if (dupId.length) set(`id가 중복됩니다: ${dupId.join(', ')}`, 'error');
  const nums = qs.map((q) => q.number).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  if (nums.some((n, i) => n !== i + 1)) set('번호가 1부터 빠짐없이 이어지지 않습니다');

  const n = raw.length;
  if (n !== 40) set(`${n}문항 세트입니다 (실전 세트는 40문항)`, 'info');
  else {
    if (blueprint) {
      for (const [unit, { count }] of Object.entries(blueprint.units)) {
        const c = qs.filter((q) => q.unit === unit).length;
        if (Math.abs(c - count) > blueprint.jitter) set(`${unit} ${c}문항 (배분 기준 ${count}±${blueprint.jitter})`);
      }
    }
    const byAns = [1, 2, 3, 4, 5].map((a) => qs.filter((q) => q.answer === a).length);
    if (byAns.some((c) => Math.abs(c - n / 5) > 3)) set(`정답 번호 분포가 치우쳤습니다: ${byAns.map((c, i) => `${i + 1}번 ${c}`).join(', ')}`);
  }
  return issues;
}

/** 여러 세트에 걸친 id 중복 */
export function crossSetIssues(sets: { setId: string; questions: unknown }[]): Issue[] {
  const seen = new Map<string, string>();
  const issues: Issue[] = [];
  for (const { setId, questions } of sets) {
    if (!Array.isArray(questions)) continue;
    for (const q of questions) {
      if (!isObj(q) || !isStr(q.id)) continue;
      const prev = seen.get(q.id);
      if (prev && prev !== setId) issues.push({ level: 'error', where: q.id, message: `다른 세트(${prev})와 id가 같습니다` });
      seen.set(q.id, setId);
    }
  }
  return issues;
}
