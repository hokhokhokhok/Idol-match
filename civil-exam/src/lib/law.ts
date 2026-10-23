import { LAW_FULL_NAME } from './config';
import type { Instrument, LawQuestion, Pattern } from '../types';

/** 약칭·흔한 별칭 → 정식 법률명 */
export const LAW_ALIAS: Record<string, string> = {
  ...LAW_FULL_NAME,
  국토법: LAW_FULL_NAME.국토계획법,
  공시법: LAW_FULL_NAME.부동산공시법,
  감평법: LAW_FULL_NAME.감정평가법,
  공간정보관리법: LAW_FULL_NAME.공간정보법,
  측량수로지적법: LAW_FULL_NAME.공간정보법,
  부동산등기법: LAW_FULL_NAME.등기법,
  도정법: LAW_FULL_NAME.도시정비법,
  동산담보법: LAW_FULL_NAME.동산채권담보법,
};

const squash = (s: string) => s.replace(/\s+/g, '');
const fullName = (name: string) => LAW_ALIAS[squash(name)] ?? LAW_ALIAS[name.trim()] ?? name.trim();

export type ParsedCite = {
  /** 정식 법률명 (시행령·시행규칙 제외) */
  name: string;
  instrument: Instrument;
  /** "제84조", "제84조의2", "별표2" — 없으면 법령 전체 */
  article?: string;
  /** 항·호 등 나머지 ("제1항 제2호") */
  rest: string;
};

/** "국토의 계획 및 이용에 관한 법률 시행령 제84조 제1항" → { name, instrument: '시행령', article: '제84조', rest: '제1항' } */
export function parseCite(cite: string): ParsedCite | null {
  const s = cite.trim();
  const m =
    s.match(/^(.+?)\s*(시행령|시행규칙)?\s+(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(.*)$/) ??
    s.match(/^(.+?)\s*(시행령|시행규칙)?\s+(별표\s*\d+(?:\s*의\s*\d+)?)\s*(.*)$/);
  if (m) return { name: fullName(m[1]), instrument: (m[2] as Instrument) ?? '법', article: squash(m[3]), rest: m[4].trim() };
  const n = s.match(/^(.+?)\s*(시행령|시행규칙)?$/);
  return n ? { name: fullName(n[1]), instrument: (n[2] as Instrument) ?? '법', rest: '' } : null;
}

/** 국가법령정보센터 현행 조문 주소 (온라인일 때 원문 대조용) */
export function lawGoKrUrl(p: ParsedCite): string {
  const title = squash(p.name + (p.instrument === '시행령' || p.instrument === '시행규칙' ? p.instrument : ''));
  return encodeURI(`https://www.law.go.kr/법령/${title}${p.article && p.article.startsWith('제') ? `/${p.article}` : ''}`);
}

/** 검색어의 약칭 토큰(예: 국토계획법)을 정식 명칭으로 바꾼 뒤 공백 없이 */
const normQuery = (q: string) =>
  q
    .trim()
    .split(/\s+/)
    .map((t) => LAW_ALIAS[t] ?? t)
    .join('')
    .replace(/\s+/g, '');

/**
 * 근거 조문이 검색어에 해당하는지. 공백·약칭을 무시하고,
 * "제84조"로 찾을 때 "제84조의2"는 다른 조문이므로 제외한다.
 */
export function citeMatches(cite: string, query: string): boolean {
  const q = normQuery(query);
  if (!q) return false;
  const c = squash(cite);
  for (let i = c.indexOf(q); i >= 0; i = c.indexOf(q, i + 1)) {
    const next = c[i + q.length];
    if (/조$/.test(q) && next === '의') continue;
    if (/\d$/.test(q) && next !== undefined && /\d/.test(next)) continue;
    return true;
  }
  return false;
}

/** 문항 유형 필터: pattern 필드가 없으면 type·topic·발문으로 추정 */
export function patternOf(q: LawQuestion): Pattern {
  if (q.pattern) return q.pattern;
  if (q.type === 'numeric') return '숫자·기간';
  if (q.type === 'case') return '사례';
  const t = `${q.topic} ${q.stem}`;
  if (/절차|순서|신청|통지|공고/.test(t)) return '절차·순서';
  if (/예외|단서|제외|아닌 것/.test(t)) return '예외·단서';
  if (q.volatile) return '숫자·기간';
  return '정의';
}

/** "2026-10-24" → "2026.10.24" */
export const formatAsOf = (d: string) => d.replace(/-/g, '.');
