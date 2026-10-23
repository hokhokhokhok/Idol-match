import { describe, expect, it } from 'vitest';
import lawSeed from '../data/sets/law-seed-001.json';
import type { LawQuestion } from '../types';
import { citeMatches, lawGoKrUrl, parseCite, patternOf } from './law';
import { findArticle, type LawTextFile } from './lawtexts';

describe('parseCite', () => {
  it('splits law name, instrument, article and the rest', () => {
    expect(parseCite('국토의 계획 및 이용에 관한 법률 시행령 제84조 제1항')).toEqual({
      name: '국토의 계획 및 이용에 관한 법률',
      instrument: '시행령',
      article: '제84조',
      rest: '제1항',
    });
    expect(parseCite('건축법 제2조 제1항 제8호')).toMatchObject({ name: '건축법', instrument: '법', article: '제2조', rest: '제1항 제8호' });
    expect(parseCite('공간정보의 구축 및 관리 등에 관한 법률 시행규칙 제64조')).toMatchObject({ instrument: '시행규칙', article: '제64조' });
    expect(parseCite('도시 및 주거환경정비법 제39조의2')).toMatchObject({ article: '제39조의2' });
    expect(parseCite('국토계획법 시행령 별표 2')).toMatchObject({ name: '국토의 계획 및 이용에 관한 법률', article: '별표2' });
    expect(parseCite('부동산등기법')).toEqual({ name: '부동산등기법', instrument: '법', rest: '' });
  });

  it('builds a law.go.kr link', () => {
    expect(decodeURI(lawGoKrUrl(parseCite('건축법 시행령 제2조')!))).toBe('https://www.law.go.kr/법령/건축법시행령/제2조');
    expect(decodeURI(lawGoKrUrl(parseCite('국유재산법 제6조')!))).toBe('https://www.law.go.kr/법령/국유재산법/제6조');
  });
});

describe('citeMatches', () => {
  const cite = '국토의 계획 및 이용에 관한 법률 시행령 제84조 제1항';
  it('ignores spaces and expands short names', () => {
    expect(citeMatches(cite, '국토계획법 시행령 제84조')).toBe(true);
    expect(citeMatches(cite, '국토의계획및이용에관한법률시행령 제84조')).toBe(true);
    expect(citeMatches(cite, '제84조')).toBe(true);
    expect(citeMatches(cite, '국토계획법 제84조')).toBe(false); // 법률 제84조가 아니라 시행령
  });
  it('does not confuse 제84조 with 제84조의2 or 제8조', () => {
    expect(citeMatches('도시 및 주거환경정비법 제84조의2', '제84조')).toBe(false);
    expect(citeMatches('건축법 제84조', '제8조')).toBe(false);
    expect(citeMatches('건축법 제2조 제1항 제11호', '제2조 제1항 제1호')).toBe(false);
    expect(citeMatches('건축법 제2조 제1항 제1호', '제2조 제1항 제1호')).toBe(true);
  });
});

describe('law texts', () => {
  const files: LawTextFile[] = [
    { name: '건축법', instrument: '법', articles: { 제2조: { title: '정의', text: '① …' } } },
    { name: '건축법', instrument: '시행령', articles: { 제2조: { text: '시행령 정의' } } },
  ];
  it('finds the article of the right instrument', () => {
    expect(findArticle(parseCite('건축법 제2조 제1항 제8호'), files)?.title).toBe('정의');
    expect(findArticle(parseCite('건축법 시행령 제2조'), files)?.text).toBe('시행령 정의');
    expect(findArticle(parseCite('건축법 제3조'), files)).toBeNull();
  });
});

describe('patternOf', () => {
  const qs = lawSeed as LawQuestion[];
  it('uses the pattern field, else infers from type/topic', () => {
    expect(patternOf(qs[1])).toBe('숫자·기간');
    const { pattern: _p, ...rest } = qs[4];
    expect(patternOf(rest as LawQuestion)).toBe('절차·순서'); // "신청"
    expect(patternOf({ ...rest, type: 'case' } as LawQuestion)).toBe('사례');
  });
});
