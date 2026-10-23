import { describe, expect, it } from 'vitest';
import blueprint from '../../config/blueprint.json';
import lawBlueprint from '../../config/law/blueprint.json';
import lawExam from '../../config/law/exam.json';
import lawLength from '../../config/law/length.json';
import lawSeed from '../data/sets/law-seed-001.json';
import econBlueprint from '../../config/econ/blueprint.json';
import econLength from '../../config/econ/length.json';
import econSeed from '../data/sets/econ-seed-001.json';
import katex from 'katex';
import { solvers } from '../solvers';
import seed from '../data/sets/seed-001.json';
import {
  crossSetIssues,
  ECON_LENGTH_RULES,
  LAW_LENGTH_RULES,
  numberOf,
  tokensOf,
  lawCoverage,
  splitCase,
  validateQuestion,
  validateSet,
  visibleLength,
  type Issue,
  type ValidateConfig,
} from './validate';

const parseMath = (tex: string) => {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const cfg: ValidateConfig = {
  blueprints: { 민법: blueprint, 감관법: lawBlueprint, 경제학원론: econBlueprint },
  econLength: econLength as unknown as ValidateConfig['econLength'],
  solvers,
  parseMath,
  lawLength: lawLength as unknown as ValidateConfig['lawLength'],
  lawAsOf: lawExam.lawAsOf,
};

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

  it('warns when the explanation marks a different choice as the answer', () => {
    const bad = q(1);
    bad.answer = 2;
    expect(warns(validateQuestion(bad, 'seed-001', 1))).toContain(
      '보기별 해설에서 정답으로 설명한 보기(1번)가 answer(2번)와 다릅니다',
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

describe('validate 감관법', () => {
  const lq = (n: number) => clone(lawSeed[n]) as Record<string, any>;

  it('law seed set has no schema errors; default length rules match config', () => {
    expect(errors(validateSet(lawSeed, 'law-seed-001', cfg))).toEqual([]);
    const { _note, ...rules } = lawLength;
    expect(rules).toEqual(JSON.parse(JSON.stringify(LAW_LENGTH_RULES)));
  });

  it('requires subject, law, legalBasis and lawAsOf', () => {
    const bad = lq(0);
    delete bad.lawAsOf;
    bad.law = '민사소송법';
    bad.explanation.legalBasis = [];
    bad.volatile = 'yes';
    expect(errors(validateQuestion(bad, 'law-seed-001', 0))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('lawAsOf'),
        expect.stringContaining('law "민사소송법"'),
        expect.stringContaining('legalBasis'),
        expect.stringContaining('volatile'),
      ]),
    );
    const noSubject = lq(0);
    delete noSubject.subject;
    expect(errors(validateQuestion(noSubject, 'law-seed-001', 0))).toEqual(expect.arrayContaining([expect.stringContaining('subject')]));
  });

  it('warns on instrument mismatch, missing volatile and missing law name', () => {
    const bad = lq(1);
    bad.volatile = false;
    bad.explanation.legalBasis[1].instrument = '법';
    bad.stem = '용도지역별 건폐율의 최대한도로 옳은 것은?';
    expect(warns(validateQuestion(bad, 'law-seed-001', 1))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('volatile이 false'),
        expect.stringContaining('instrument가 "법"인데 시행령'),
        expect.stringContaining('법률 이름'),
      ]),
    );
  });

  it('flags a suspected second correct answer', () => {
    const pos = lq(0); // 옳은 것은?
    pos.explanation.perChoice[2] = '상업지역 세분에 관한 설명으로 옳다.';
    expect(warns(validateQuestion(pos, 'law-seed-001', 0))).toContain('복수 정답 의심: 옳다고 해설한 보기가 1, 3번입니다');
    const neg = lq(5); // 옳지 않은 것은?
    neg.explanation.perChoice[0] = '부속건축물만 있는 대지는 신축에 해당하지 않으므로 틀렸다.';
    expect(warns(validateQuestion(neg, 'law-seed-001', 5))).toContain('복수 정답 의심: 옳지 않다고 해설한 보기가 1, 4번입니다');
    expect(warns(validateQuestion(lq(5), 'law-seed-001', 5)).filter((w) => w.includes('복수'))).toEqual([]);
  });

  it('allows tables only in 감관법 stems, with colspan/rowspan only', () => {
    const t = lq(1);
    t.stem += '\n\n<table><tr><th>지역</th><td colspan="2">80%</td></tr></table>';
    expect(errors(validateQuestion(t, 'law-seed-001', 1))).toEqual([]);
    t.stem = t.stem.replace('<table>', '<table style="x">');
    expect(errors(validateQuestion(t, 'law-seed-001', 1))[0]).toContain('colspan·rowspan');
    const c = q(1);
    c.stem += '<table><tr><td>x</td></tr></table>';
    expect(errors(validateQuestion(c, 'seed-001', 1))[0]).toContain('허용되지 않은 태그');
  });

  it('checks 40-question law sets against the law blueprint', () => {
    const set = Array.from({ length: 40 }, (_, i) => ({ ...lq(1), number: i + 1, id: `law-t-q${String(i + 1).padStart(2, '0')}`, setId: 'law-t' }));
    const w = warns(validateSet(set, 'law-t', cfg));
    expect(w).toEqual(expect.arrayContaining([expect.stringContaining('국토계획법 40문항 (배분 기준 13±1)'), expect.stringContaining('건축법 0문항')]));
    expect(errors(validateSet([q(0), lq(0)], 'mixed'))).toEqual(expect.arrayContaining([expect.stringContaining('여러 과목')]));
  });

  it('reports pool coverage per law', () => {
    const [i] = lawCoverage([{ setId: 'law-x', questions: [lq(0), lq(5)] }], lawBlueprint);
    expect(i.message).toContain('국토계획법 1/13(부족)');
    expect(i.message).toContain('건축법 1/4(부족)');
  });
});

describe('bundled sets', () => {
  const sets = import.meta.glob<unknown[]>('../data/sets/*.json', { eager: true, import: 'default' });
  for (const [path, qs] of Object.entries(sets)) {
    const setId = path.split('/').pop()!.replace('.json', '');
    it(`${setId} has no validation errors`, () => {
      expect(errors(validateSet(qs, setId, cfg))).toEqual([]);
    });
  }
  for (const [path, qs] of Object.entries(sets)) {
    const setId = path.split('/').pop()!.replace('.json', '');
    if (/(^|-)seed-/.test(setId)) continue;
    it(`${setId} meets the exam length and distribution rules (strict)`, () => {
      expect(warns(validateSet(qs, setId, cfg))).toEqual([]);
    });
  }
});

describe('validate 경제학원론', () => {
  const eq = (n: number) => clone(econSeed[n]) as Record<string, any>;

  it('seed set passes, including calculation checks; length defaults match config', () => {
    expect(errors(validateSet(econSeed, 'econ-seed-001', cfg))).toEqual([]);
    const { _note, ...rules } = econLength;
    expect(rules).toEqual(JSON.parse(JSON.stringify(ECON_LENGTH_RULES)));
  });

  it('reads choice values', () => {
    expect(numberOf('$Y = 1{,}200$')).toBe(1200);
    expect(numberOf('자중손실 1,600')).toBe(1600);
    expect(numberOf('$-\\frac{1}{2}$')).toBe(-0.5);
    expect(tokensOf('가격 60, 자중손실 800').tokens).toEqual([60, 800]);
    expect(tokensOf('1.5, 감소').tokens).toEqual([1.5, '감소']);
    expect(tokensOf('+250, -200').tokens).toEqual([250, -200]);
  });

  it('catches a wrong answer key, a duplicate correct value and a wrong expected', () => {
    const wrong = eq(5); // 독점: 정답 ③ 가격 60, 자중손실 800
    wrong.answer = 2;
    expect(errors(validateQuestion(wrong, 'econ-seed-001', 5, cfg))).toEqual(
      expect.arrayContaining([expect.stringContaining('정답 2번 보기 "가격 60, 자중손실 400"가 풀이 결과 60, 800와 다릅니다')]),
    );
    const dup = eq(4); // 통화승수: 200
    dup.choices[0] = '200.0';
    expect(errors(validateQuestion(dup, 'econ-seed-001', 4, cfg))).toEqual(
      expect.arrayContaining([expect.stringContaining('정답 외 보기(1번)도 풀이 결과 200')]),
    );
    const exp = eq(0);
    exp.calc.expected = 2;
    expect(errors(validateQuestion(exp, 'econ-seed-001', 0, cfg))[0]).toContain('풀이 결과 1.5, 감소 ≠ calc.expected 2');
    const noCalc = eq(4);
    delete noCalc.calc;
    expect(errors(validateQuestion(noCalc, 'econ-seed-001', 4, cfg))[0]).toContain('calc(solverId, params, expected)가 없습니다');
  });

  it('claims: exactly the answer must hold', () => {
    const tax = eq(1); // 종량세: ② 소비자 가격 55가 유일하게 참
    tax.calc.claims[2] = { key: 'producerPrice', value: 45 }; // ③도 참이 됨
    expect(errors(validateQuestion(tax, 'econ-seed-001', 1, cfg))).toEqual(
      expect.arrayContaining([expect.stringContaining('옳은 보기는 2, 3번인데 answer는 2번')]),
    );
    const bad = eq(1);
    bad.calc.claims[0] = { key: 'nope', value: 1 };
    expect(errors(validateQuestion(bad, 'econ-seed-001', 1, cfg))[0]).toContain('값 "nope"가 없습니다');
  });

  it('flags broken TeX, unknown solvers and figure coordinates outside the axes', () => {
    const tex = eq(0);
    tex.stem = tex.stem.replace('$Q = 200 - 4P$', '$Q = \\frac{200 - 4P$');
    expect(errors(validateQuestion(tex, 'econ-seed-001', 0, cfg)).join()).toContain('수식');
    const sol = eq(0);
    sol.calc.solverId = 'unknown';
    expect(errors(validateQuestion(sol, 'econ-seed-001', 0, cfg))[0]).toContain('풀이 함수 "unknown"가 없습니다');
    const fig = eq(5);
    fig.figure.series[0].points[1] = [120, 0];
    fig.figure.series.push({ name: 'MC', points: [[0, 1]] });
    const e = errors(validateQuestion(fig, 'econ-seed-001', 5, cfg));
    expect(e).toEqual(expect.arrayContaining([expect.stringContaining('xMax(100)를 넘습니다'), expect.stringContaining('"MC"이 중복')]));
  });

  it('field must match the unit', () => {
    const f = eq(0);
    f.field = '거시';
    expect(warns(validateQuestion(f, 'econ-seed-001', 0, cfg))).toContain('수요공급·탄력성·조세 단원은 미시 영역입니다 (field: 거시)');
  });
});
