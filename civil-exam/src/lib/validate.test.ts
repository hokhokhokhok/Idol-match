import { describe, expect, it } from 'vitest';
import blueprint from '../../config/blueprint.json';
import seed from '../data/sets/seed-001.json';
import { crossSetIssues, splitCase, validateQuestion, validateSet, visibleLength, type Issue } from './validate';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const errors = (is: Issue[]) => is.filter((i) => i.level === 'error').map((i) => i.message);
const warns = (is: Issue[]) => is.filter((i) => i.level === 'warn').map((i) => i.message);
const q = (n: number) => clone(seed[n]) as Record<string, any>;

describe('validate-questions', () => {
  it('seed set has no schema errors', () => {
    expect(errors(validateSet(seed, 'seed-001', blueprint))).toEqual([]);
  });

  it('catches broken schema', () => {
    const bad = q(1);
    bad.choices = bad.choices.slice(0, 4);
    bad.answer = 6;
    bad.unit = '가족법';
    bad.source = 'past-exam';
    bad.explanation.perChoice = ['a'];
    expect(errors(validateQuestion(bad, 'seed-001', 0))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('choices는 5개'),
        expect.stringContaining('answer는 1~5'),
        expect.stringContaining('unit "가족법"'),
        expect.stringContaining('source는 "original"'),
        expect.stringContaining('perChoice'),
      ]),
    );
  });

  it('rejects numbering inside choices, bad markup and setId mismatch', () => {
    const bad = q(1);
    bad.choices[0] = '① 본인이 추인하면 소급한다.';
    bad.stem = '<b>무권대리</b>에 관한 <u>옳은 것은?';
    const e = errors(validateQuestion(bad, 'other-set', 0));
    expect(e).toEqual(
      expect.arrayContaining([
        expect.stringContaining('1번 보기 앞의 번호 기호'),
        expect.stringContaining('<u> 짝'),
        expect.stringContaining('setId'),
      ]),
    );
  });

  it('combo choices must use box labels; box labels in order', () => {
    const bad = q(0);
    bad.choices[4] = 'ㄴ, ㅁ';
    bad.box.items[2].label = 'ㄹ';
    const e = errors(validateQuestion(bad, 'seed-001', 0));
    expect(e).toEqual(
      expect.arrayContaining([expect.stringContaining('5번 보기 "ㄴ, ㅁ"'), expect.stringContaining('label은 "ㄷ"')]),
    );
  });

  it('length rules warn, not fail', () => {
    const short = q(2);
    short.choices[0] = '상속';
    expect(errors(validateQuestion(short, 'seed-001', 2))).toEqual([]);
    expect(warns(validateQuestion(short, 'seed-001', 2))).toContain('분량: 1번 보기 2자 (기준 50~120자)');
  });

  it('counts visible characters and splits case facts', () => {
    expect(visibleLength('<u>옳지 않은</u> **것**')).toBe(7);
    const { facts, question } = splitCase(seed[4].stem);
    expect(question).toBe('이에 관한 설명으로 옳은 것은?');
    expect(facts.endsWith('의사표시를 하였다.')).toBe(true);
  });

  it('40-question set: blueprint and answer distribution', () => {
    const set = Array.from({ length: 40 }, (_, i) => {
      const x = q(1);
      x.number = i + 1;
      x.id = `t-q${String(i + 1).padStart(2, '0')}`;
      x.setId = 't';
      return x;
    });
    const w = warns(validateSet(set, 't', blueprint));
    expect(w).toEqual(expect.arrayContaining([expect.stringContaining('총칙 40문항'), expect.stringContaining('정답 번호 분포')]));
  });

  it('duplicate numbers and cross-set ids are errors', () => {
    const dup = [q(0), q(0)];
    expect(errors(validateSet(dup, 'seed-001'))).toEqual(
      expect.arrayContaining([expect.stringContaining('번호가 중복'), expect.stringContaining('id가 중복')]),
    );
    expect(errors(crossSetIssues([{ setId: 'a', questions: [q(0)] }, { setId: 'b', questions: [q(0)] }]))).toHaveLength(1);
  });
});

describe('bundled sets', () => {
  const sets = import.meta.glob<unknown[]>('../data/sets/*.json', { eager: true, import: 'default' });
  for (const [path, qs] of Object.entries(sets)) {
    const setId = path.split('/').pop()!.replace('.json', '');
    it(`${setId} has no validation errors`, () => {
      expect(errors(validateSet(qs, setId, blueprint))).toEqual([]);
    });
  }
  for (const [path, qs] of Object.entries(sets)) {
    const setId = path.split('/').pop()!.replace('.json', '');
    if (setId.startsWith('seed')) continue;
    it(`${setId} meets the exam length and distribution rules (strict)`, () => {
      expect(warns(validateSet(qs, setId, blueprint))).toEqual([]);
    });
  }
});
