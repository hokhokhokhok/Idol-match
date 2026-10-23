/**
 * 문항 세트 검증 (scripts/validate-questions.ts 에서 실행, vitest로 테스트).
 * - error: 스키마 위반 — 앱이 깨지거나 채점이 틀어진다. 빌드를 막는다.
 * - warn: 기획안의 분량·구성 기준 이탈, 복수 정답 의심 — 검수 때 확인. --strict 이면 error로 취급.
 * - info: 미검수·판례 미확인 등 진행 상황.
 *
 * 과목(subject)에 따라 민법 규칙과 감관법 규칙을 나눠 적용한다.
 * Node가 이 파일을 직접 실행하므로 런타임 import 없이 타입만 가져온다.
 */
import type { CivilType, Law, LawType, Pattern, Question, Subject, Unit } from '../types';

export type Level = 'error' | 'warn' | 'info';
export type Issue = { level: Level; where: string; message: string };

export type Blueprint = { total: number; jitter: number; units: Record<string, { count: number }> };

type Range = readonly [number, number];
export type LengthRule = { stem?: Range; facts?: Range; choice?: Range; boxItem?: Range; total: Range };

export type ValidateConfig = {
  /** 과목별 40문항 배분 기준 */
  blueprints?: Partial<Record<Subject, Blueprint>>;
  /** 감관법 분량 기준 (config/law/length.json). 없으면 LAW_LENGTH_RULES */
  lawLength?: Partial<Record<LawType, LengthRule>>;
  /** 감관법 기준 법령일 (config/law/exam.json lawAsOf). 다르면 참고로 알린다 */
  lawAsOf?: string;
};

const SUBJECTS: readonly Subject[] = ['민법', '감관법'];
const UNITS: readonly Unit[] = ['총칙', '물권', '계약', '채권총론', '기타'];
const CIVIL_TYPES: readonly CivilType[] = ['single', 'count', 'combo', 'case', 'precedent'];
const LAWS: readonly Law[] = ['국토계획법', '부동산공시법', '감정평가법', '국유재산법', '건축법', '공간정보법', '등기법', '도시정비법', '동산채권담보법'];
const LAW_TYPES: readonly LawType[] = ['single', 'count', 'combo', 'case', 'numeric'];
const PATTERNS: readonly Pattern[] = ['정의', '숫자·기간', '절차·순서', '예외·단서', '사례'];
const INSTRUMENTS = ['법', '시행령', '시행규칙', '고시'] as const;
/** 발문에 들어가야 하는 법률 이름 */
const LAW_STEM: Record<Law, RegExp> = {
  국토계획법: /국토의 계획 및 이용에 관한 법/,
  부동산공시법: /부동산 가격공시에 관한 법/,
  감정평가법: /감정평가 및 감정평가사에 관한 법/,
  국유재산법: /국유재산법/,
  건축법: /건축법/,
  공간정보법: /공간정보의 구축 및 관리 등에 관한 법/,
  등기법: /부동산등기법/,
  도시정비법: /도시 및 주거환경정비법/,
  동산채권담보법: /동산[·ㆍ]채권 등의 담보에 관한 법/,
};
const BOX_LABELS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];
const CIRCLED = /^\s*[①②③④⑤]|^\s*[1-5][.)]\s/;
const DISPUTE_NOTE = /\s*\(다툼이 있는 경우 판례에 따름\)\s*/g;
/** 발문 끝 괄호 단서: "(조례는 고려하지 않으며, 다툼이 있는 경우 판례에 따름)" 등 */
const STEM_NOTE = /\s*\([^()]*(?:고려하지 않|판례에 따름|특례는|조례는)[^()]*\)\s*/g;
const TABLE_RE = /<table\b[^>]*>[\s\S]*?<\/table>/g;
const TABLE_TAGS = ['table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td'];

/** 민법 분량 기준(공백 포함 글자 수, 마크업·"(다툼이 있는 경우 판례에 따름)" 제외) */
export const LENGTH_RULES: Record<CivilType, LengthRule> = {
  single: { stem: [20, 40], choice: [50, 120], total: [300, 650] },
  combo: { stem: [20, 80], boxItem: [60, 130], total: [400, 700] },
  count: { stem: [20, 80], boxItem: [60, 130], total: [400, 700] },
  case: { facts: [200, 380], choice: [50, 130], total: [550, 900] },
  precedent: { stem: [20, 40], choice: [60, 130], total: [350, 650] },
};

/** 감관법 분량 기준 기본값 — config/law/length.json 과 같은 값 (테스트가 일치 확인) */
export const LAW_LENGTH_RULES: Record<LawType, LengthRule> = {
  single: { stem: [25, 60], choice: [50, 160], total: [350, 850] },
  combo: { stem: [25, 60], boxItem: [60, 150], total: [450, 800] },
  count: { stem: [25, 60], boxItem: [60, 150], total: [450, 800] },
  case: { facts: [150, 350], choice: [50, 140], total: [550, 950] },
  numeric: { stem: [25, 60], choice: [40, 100], total: [300, 600] },
};

/** 화면에 보이는 글자 수: 인라인 마크업 제거 후 코드포인트 수 */
export const visibleLength = (s: string) => [...s.replace(/\*\*|<\/?u>/g, '')].length;
const bodyLength = (s: string) => visibleLength(s.replace(TABLE_RE, ' ').replace(STEM_NOTE, ' ').replace(DISPUTE_NOTE, ' ').trim());
/** 표 안 글자 수 (셀 텍스트만) */
const tableLength = (s: string) =>
  (s.match(TABLE_RE) ?? []).reduce((n, t) => n + visibleLength(t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()), 0);

/** 사례형 stem을 사실관계와 마지막 발문(물음표로 끝나는 문장)으로 나눈다 */
export function splitCase(stem: string): { facts: string; question: string } {
  const s = stem.replace(TABLE_RE, ' ').replace(STEM_NOTE, ' ').replace(DISPUTE_NOTE, '').trim();
  const m = s.match(/^(.*[.。])\s*([^.。]*\?)$/s);
  return m ? { facts: m[1].trim(), question: m[2].trim() } : { facts: s, question: '' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/** **, <u></u> 짝과 허용되지 않은 태그 검사. allowTable이면 표 태그(colspan/rowspan 속성만)도 허용 */
function markupProblem(s: string, allowTable = false): string | null {
  if ((s.match(/\*\*/g) ?? []).length % 2) return '** 짝이 맞지 않습니다';
  const open = (s.match(/<u>/g) ?? []).length;
  const close = (s.match(/<\/u>/g) ?? []).length;
  if (open !== close) return '<u> 짝이 맞지 않습니다';
  let rest = s.replace(/<\/?u>/g, '');
  if (allowTable) {
    for (const t of TABLE_TAGS) {
      const o = (rest.match(new RegExp(`<${t}\\b[^>]*>`, 'g')) ?? []).length;
      const c = (rest.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
      if (o !== c) return `<${t}> 짝이 맞지 않습니다`;
    }
    const badAttr = rest.match(/<(?:table|caption|thead|tbody|tr|th|td)\b([^>]*)>/g)?.find((tag) =>
      tag.replace(/^<\w+/, '').replace(/>$/, '').replace(/\s*(?:colspan|rowspan)\s*=\s*["']?\d+["']?/gi, '').trim(),
    );
    if (badAttr) return `표 태그에는 colspan·rowspan 속성만 쓸 수 있습니다: ${badAttr}`;
    rest = rest.replace(new RegExp(`</?(?:${TABLE_TAGS.join('|')})\\b[^>]*>`, 'g'), '');
    if ((s.match(/<table\b/g) ?? []).length && !/<tr\b[\s\S]*<t[hd]\b/.test(s)) return '표에 행(<tr>)과 칸(<th>/<td>)이 없습니다';
  }
  const other = rest.match(/<\/?[a-zA-Z][^>]*>/);
  if (other)
    return `허용되지 않은 태그 ${other[0]} (**굵게**, <u>밑줄</u>${allowTable ? ', 표(table)' : ''}만 지원)`;
  return null;
}

/** 해설 문장 끝의 판정: 정답 / 옳음 / 틀림 */
function verdictOf(text: string): 'answer' | 'true' | 'false' | null {
  const t = text.trim();
  if (/정답\.?\s*$/.test(t)) return 'answer';
  if (/(옳다|옳은 설명이다|맞는 설명이다|내용 그대로이다)\.?\s*$/.test(t)) return 'true';
  if (/(틀렸다|틀리다|틀린 설명이다|옳지 않다|잘못이다)\.?\s*$/.test(t)) return 'false';
  return null;
}

const NEGATIVE_STEM = /옳지 않은|틀린 것|아닌 것|해당하지 않는|없는 것/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 문항 1개 검사. setId는 파일 이름에서 온 값 */
export function validateQuestion(raw: unknown, setId: string, index: number, cfg: ValidateConfig = {}): Issue[] {
  const issues: Issue[] = [];
  const where = isObj(raw) && isStr(raw.id) ? raw.id : `${setId}[${index}]`;
  const err = (message: string) => issues.push({ level: 'error', where, message });
  const warn = (message: string) => issues.push({ level: 'warn', where, message });
  const info = (message: string) => issues.push({ level: 'info', where, message });

  if (!isObj(raw)) {
    err('문항이 객체가 아닙니다');
    return issues;
  }
  const q = raw as Record<string, unknown> & Partial<Question>;
  const subject = q.subject as Subject;
  const law = subject === '감관법';
  if (!SUBJECTS.includes(subject)) err(`subject "${String(q.subject)}"은(는) ${SUBJECTS.join('/')} 중 하나여야 합니다`);

  // ── 기본 필드 ──
  if (!isStr(q.id)) err('id가 없습니다');
  if (q.setId !== setId) err(`setId "${String(q.setId)}"가 파일 이름 "${setId}"와 다릅니다`);
  if (!isInt(q.number, 1, 40)) err(`number는 1~40 정수여야 합니다 (현재 ${String(q.number)})`);
  else if (isStr(q.id) && q.id !== `${setId}-q${pad2(q.number as number)}`)
    warn(`id는 "${setId}-q${pad2(q.number as number)}" 형식을 권장합니다`);
  if (law) {
    if (!LAWS.includes(q.law as Law)) err(`law "${String(q.law)}"은(는) ${LAWS.join('/')} 중 하나여야 합니다`);
    if (!LAW_TYPES.includes(q.type as LawType)) err(`type "${String(q.type)}"은(는) ${LAW_TYPES.join('/')} 중 하나여야 합니다`);
    if (q.pattern === undefined) warn(`pattern(문항 유형: ${PATTERNS.join('/')})이 없습니다 — 앱이 추정합니다`);
    else if (!PATTERNS.includes(q.pattern as Pattern)) err(`pattern "${String(q.pattern)}"은(는) ${PATTERNS.join('/')} 중 하나여야 합니다`);
  } else if (subject === '민법') {
    if (!UNITS.includes(q.unit as Unit)) err(`unit "${String(q.unit)}"은(는) ${UNITS.join('/')} 중 하나여야 합니다`);
    if (!CIVIL_TYPES.includes(q.type as CivilType)) err(`type "${String(q.type)}"은(는) ${CIVIL_TYPES.join('/')} 중 하나여야 합니다`);
  }
  if (!isStr(q.topic)) err('topic이 비어 있습니다');
  if (!isStr(q.stem)) err('stem(발문)이 비어 있습니다');
  if (![1, 2, 3].includes(q.difficulty as number)) err('difficulty는 1, 2, 3 중 하나여야 합니다');
  if (q.source !== 'original') err('source는 "original"이어야 합니다 (기출·학원 문항 전재 금지)');
  if (typeof q.reviewed !== 'boolean') err('reviewed는 true/false여야 합니다');

  // ── 보기·정답 ──
  const choices = Array.isArray(q.choices) ? (q.choices as unknown[]) : null;
  if (!choices || choices.length !== 5) err(`choices는 5개여야 합니다 (현재 ${choices ? choices.length : '없음'})`);
  choices?.forEach((c, i) => {
    if (!isStr(c)) err(`${i + 1}번 보기가 비어 있습니다`);
    else if (CIRCLED.test(c)) err(`${i + 1}번 보기 앞의 번호 기호를 빼세요 (①~⑤는 화면이 붙입니다)`);
  });
  if (choices && new Set(choices.map((c) => String(c).trim())).size !== choices.length) err('같은 내용의 보기가 있습니다');
  if (!isInt(q.answer, 1, 5)) err(`answer는 1~5 정수여야 합니다 (현재 ${String(q.answer)})`);

  // ── 해설 ──
  const ex = q.explanation as unknown;
  if (!isObj(ex)) err('explanation이 없습니다');
  else {
    if (!isStr(ex.summary)) err('explanation.summary(핵심 한 줄)가 비어 있습니다');
    const per = Array.isArray(ex.perChoice) ? ex.perChoice : null;
    if (!per || per.length !== 5 || !per.every(isStr)) err('explanation.perChoice는 비어 있지 않은 5개여야 합니다');
    if (law) {
      const lb = ex.legalBasis;
      if (!Array.isArray(lb) || lb.length === 0) err('explanation.legalBasis(근거 조문)가 없습니다');
      else
        lb.forEach((b, i) => {
          if (!isObj(b) || !INSTRUMENTS.includes(b.instrument as never) || !isStr(b.cite)) {
            err(`legalBasis[${i}]는 instrument(${INSTRUMENTS.join('/')})와 cite(문자열)가 필요합니다`);
            return;
          }
          const cite = b.cite as string;
          const named = /시행규칙/.test(cite) ? '시행규칙' : /시행령/.test(cite) ? '시행령' : null;
          if (b.instrument === '법' && named) warn(`legalBasis[${i}] "${cite}": instrument가 "법"인데 ${named}입니다`);
          if ((b.instrument === '시행령' || b.instrument === '시행규칙') && named !== b.instrument)
            warn(`legalBasis[${i}] "${cite}": instrument "${b.instrument}"와 조문 표기가 다릅니다`);
          if (b.instrument !== '고시' && !/제\s*\d+\s*조|별표/.test(cite)) warn(`legalBasis[${i}] "${cite}": 조문 번호(제○조)가 없습니다`);
        });
      if (ex.statutes !== undefined || ex.cases !== undefined) warn('감관법 문항은 statutes/cases 대신 legalBasis를 씁니다');
    } else {
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
  }

  // ── 감관법: 기준 법령일·개정 위험 ──
  if (law) {
    if (!isStr(q.lawAsOf)) err('lawAsOf(기준 법령일)가 없습니다');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(q.lawAsOf as string) || Number.isNaN(Date.parse(q.lawAsOf as string)))
      err(`lawAsOf "${String(q.lawAsOf)}"는 YYYY-MM-DD 형식이어야 합니다`);
    else if (cfg.lawAsOf && q.lawAsOf !== cfg.lawAsOf) info(`기준 법령일 ${String(q.lawAsOf)} (현재 기준 ${cfg.lawAsOf})`);
    if (typeof q.volatile !== 'boolean') err('volatile(개정되기 쉬운 수치·기간 포함 여부)은 true/false여야 합니다');
    else if (!q.volatile) {
      const text = [q.stem, ...(choices ?? [])].join(' ');
      if (q.type === 'numeric') warn('숫자·기간 비교형(numeric)인데 volatile이 false입니다');
      else if (/100분의\s*\d|\d+\s*(?:퍼센트|%|일 이내|개월|년 이내|제곱미터|㎡)/.test(text))
        warn('수치·기간이 있는데 volatile이 false입니다 (개정 확인 필요 배지가 뜨지 않음)');
    }
    if (isStr(q.stem) && LAWS.includes(q.law as Law) && !LAW_STEM[q.law as Law].test(q.stem as string))
      warn(`발문에 법률 이름(${String(q.law)})이 없습니다 — "○○법령상 …" 형식을 권장합니다`);
  }

  // ── 해설과 정답의 일치: '…정답.'으로 끝나는 보기 해설이 정답 번호와 같아야 한다 ──
  if (isObj(ex) && Array.isArray(ex.perChoice) && ex.perChoice.length === 5 && isInt(q.answer, 1, 5)) {
    const per = ex.perChoice as unknown[];
    const marked = per.flatMap((p, i) => (typeof p === 'string' && /정답\.?\s*$/.test(p) ? [i + 1] : []));
    if (marked.length && (marked.length > 1 || marked[0] !== q.answer))
      warn(`보기별 해설에서 정답으로 설명한 보기(${marked.join(', ')}번)가 answer(${String(q.answer)}번)와 다릅니다`);

    // ── 감관법: 복수 정답 의심 — 묻는 쪽(옳은/옳지 않은)으로 판정된 보기 해설이 2개 이상 ──
    if (law && isStr(q.stem) && ['single', 'numeric', 'case'].includes(q.type as string)) {
      const neg = NEGATIVE_STEM.test((q.stem as string).replace(TABLE_RE, ''));
      const wanted = neg ? 'false' : 'true';
      const hits = per.flatMap((p, i) => {
        const v = typeof p === 'string' ? verdictOf(p) : null;
        return v === 'answer' || v === wanted ? [i + 1] : [];
      });
      if (hits.length >= 2) warn(`복수 정답 의심: ${neg ? '옳지 않다' : '옳다'}고 해설한 보기가 ${hits.join(', ')}번입니다`);
      const own = typeof per[(q.answer as number) - 1] === 'string' ? verdictOf(per[(q.answer as number) - 1] as string) : null;
      if (own && own !== 'answer' && own !== wanted) warn(`정답(${String(q.answer)}번) 보기의 해설이 "${neg ? '옳다' : '틀렸다'}"로 끝납니다`);
    }
  }

  // ── 마크업 (표는 감관법 발문에서만) ──
  const texts: [string, unknown, boolean][] = [
    ['stem', q.stem, law],
    ...(choices ?? []).map((c, i) => [`${i + 1}번 보기`, c, false] as [string, unknown, boolean]),
  ];
  if (isObj(q.box) && Array.isArray(q.box.items))
    q.box.items.forEach((it, i) => texts.push([`박스 ${i + 1}`, isObj(it) ? it.text : '', false]));
  for (const [label, t, allowTable] of texts) {
    const p = typeof t === 'string' ? markupProblem(t, allowTable) : null;
    if (p) err(`${label}: ${p}`);
  }

  // ── 유형별 구성 ──
  const type = q.type as CivilType | LawType;
  const boxed = type === 'combo' || type === 'count';
  const items = isObj(q.box) && Array.isArray(q.box.items) ? (q.box.items as unknown[]) : null;
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
            err(`${i + 1}번 보기 "${String(c)}"는 박스의 기호 조합(예: ㄱ, ㄷ)이어야 합니다`);
        });
        if (isStr(q.stem) && !/모두 고른 것은/.test(q.stem as string)) warn('조합형 발문에 "모두 고른 것은"이 없습니다');
      }
      if (type === 'count' && choices) {
        if (!choices.every((c) => /^(\d개|없음)$/.test(String(c).trim()))) warn('개수형 보기는 "1개", "2개"…/"없음" 형식을 권장합니다');
        if (isStr(q.stem) && !/몇 개/.test(q.stem as string)) warn('개수형 발문에 "몇 개"가 없습니다');
      }
    }
  } else if (q.box !== undefined) warn(`${type} 유형에 box가 있습니다 (조합형·개수형만 사용)`);
  if (!law && type === 'precedent' && isStr(q.stem) && !/판례/.test(q.stem as string)) warn('판례형 발문에 "판례"가 없습니다');
  if (!law && type === 'case' && isStr(q.stem) && !/[갑을병정]/.test(q.stem as string)) warn('사례형인데 갑·을·병 등장인물이 없습니다');

  // ── 분량 ──
  const rule = law ? { ...LAW_LENGTH_RULES, ...cfg.lawLength }[type as LawType] : LENGTH_RULES[type as CivilType];
  if (rule && isStr(q.stem) && choices && choices.every((c) => typeof c === 'string')) {
    const stem = q.stem as string;
    const cs = choices as string[];
    const out = (label: string, n: number, [lo, hi]: Range) => {
      if (n < lo || n > hi) warn(`분량: ${label} ${n}자 (기준 ${lo}~${hi}자)`);
    };
    if (rule.stem) out('발문', bodyLength(stem), rule.stem);
    if (rule.facts) {
      const { facts, question } = splitCase(stem);
      out('사실관계', visibleLength(facts), rule.facts);
      if (!question) warn('사례형 stem 끝에 물음표로 끝나는 발문이 없습니다');
    }
    if (rule.choice) cs.forEach((c, i) => out(`${i + 1}번 보기`, visibleLength(c), rule.choice!));
    if (rule.boxItem && items)
      items.forEach((it) => isObj(it) && isStr(it.text) && out(`박스 ${String(it.label)}`, visibleLength(it.text as string), rule.boxItem!));
    const total =
      bodyLength(stem) +
      tableLength(stem) +
      (items ?? []).reduce<number>((s, it) => s + (isObj(it) && isStr(it.text) ? visibleLength(it.text as string) : 0), 0) +
      cs.reduce((s, c) => s + visibleLength(c), 0);
    out('문항 전체', total, rule.total);
  }

  if (q.reviewed === false) info(law ? '미검수 (reviewed: false) — law.go.kr 현행 조문과 대조 필요' : '미검수 (reviewed: false)');
  return issues;
}

/** 세트 1개 검사: 문항별 검사 + 과목 혼합·번호·id 중복, 40문항 배분, 정답 분포 */
export function validateSet(raw: unknown, setId: string, cfg: ValidateConfig | Blueprint = {}): Issue[] {
  // 예전 호출(validateSet(set, id, 민법 blueprint)) 호환
  const conf: ValidateConfig = 'units' in cfg ? { blueprints: { 민법: cfg as Blueprint } } : (cfg as ValidateConfig);
  if (!Array.isArray(raw)) return [{ level: 'error', where: setId, message: '세트 파일은 문항 배열([...])이어야 합니다' }];
  const issues = raw.flatMap((q, i) => validateQuestion(q, setId, i, conf));
  const set = (message: string, level: Level = 'warn') => issues.push({ level, where: setId, message });
  const qs = raw.filter(isObj) as (Partial<Question> & Record<string, unknown>)[];

  const subjects = [...new Set(qs.map((q) => q.subject))];
  if (subjects.length > 1) set(`한 세트에 여러 과목이 섞여 있습니다: ${subjects.join(', ')}`, 'error');
  const subject = subjects[0] as Subject | undefined;
  if (subject === '감관법' && !/^law-/.test(setId)) set('감관법 세트 파일 이름은 "law-"로 시작하기를 권장합니다 (예: law-2027-001)');

  const dup = <T,>(vals: T[]) => [...new Set(vals.filter((v, i) => vals.indexOf(v) !== i))];
  const dupNo = dup(qs.map((q) => q.number).filter((n) => n !== undefined));
  if (dupNo.length) set(`번호가 중복됩니다: ${dupNo.join(', ')}`, 'error');
  const dupId = dup(qs.map((q) => q.id).filter(Boolean));
  if (dupId.length) set(`id가 중복됩니다: ${dupId.join(', ')}`, 'error');
  const nums = qs.map((q) => q.number).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  if (nums.some((n, i) => n !== i + 1)) set('번호가 1부터 빠짐없이 이어지지 않습니다');
  if (subject === '감관법') {
    const asOf = [...new Set(qs.map((q) => q.lawAsOf).filter(Boolean))];
    if (asOf.length > 1) set(`한 세트의 기준 법령일이 여러 개입니다: ${asOf.join(', ')}`);
  }

  const n = raw.length;
  if (n !== 40) set(`${n}문항 세트입니다 (실전 세트는 40문항)`, 'info');
  else {
    const blueprint = subject ? conf.blueprints?.[subject] : undefined;
    if (blueprint) {
      const key = subject === '감관법' ? 'law' : 'unit';
      for (const [cat, { count }] of Object.entries(blueprint.units)) {
        const c = qs.filter((q) => q[key] === cat).length;
        if (Math.abs(c - count) > blueprint.jitter) set(`${cat} ${c}문항 (배분 기준 ${count}±${blueprint.jitter})`);
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

/** 감관법 문항 풀이 blueprint를 채우는지(맞춤 모의고사 구성 가능 여부) — 시드 세트 제외 */
export function lawCoverage(sets: { setId: string; questions: unknown }[], blueprint: Blueprint): Issue[] {
  const pool = sets
    .filter((s) => !/(^|-)seed-/.test(s.setId) && Array.isArray(s.questions))
    .flatMap((s) => (s.questions as unknown[]).filter(isObj))
    .filter((q) => q.subject === '감관법');
  if (!pool.length) return [];
  const parts = Object.entries(blueprint.units).map(([law, { count }]) => {
    const have = pool.filter((q) => q.law === law).length;
    return `${law} ${have}/${count}${have < count ? '(부족)' : ''}`;
  });
  return [{ level: 'info', where: '감관법 문항 풀', message: `${pool.length}문항 — ${parts.join(', ')}` }];
}
