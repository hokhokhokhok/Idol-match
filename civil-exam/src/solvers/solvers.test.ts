import { describe, expect, it } from 'vitest';
import { solvers } from '.';

const run = (id: string, p: Record<string, number>) => solvers[id].solve(p);

/** 기획안 12절 시드의 손 검산값과 교과서 공식으로 풀이 함수를 확인한다 */
describe('solvers', () => {
  it('match the hand-checked seed answers', () => {
    expect(run('linear-demand-elasticity', { a: 200, b: 4, P: 30 }).answer).toEqual([1.5, '감소']);
    const tax = run('per-unit-tax-linear', { demandIntercept: 100, demandSlope: 1, supplyIntercept: 0, supplySlope: 1, tax: 10 }).values;
    expect(tax).toMatchObject({ consumerPrice: 55, producerPrice: 45, quantity: 45, taxRevenue: 450, deadweightLoss: 25 });
    expect(run('cobb-douglas-demand', { income: 120, pxBefore: 2, pxAfter: 4, py: 3 }).values).toMatchObject({ xBefore: 30, xAfter: 15, yAfter: 20, productBefore: 600, productAfter: 300 });
    expect(run('keynesian-multiplier', { mpc: 0.8, deltaG: 50, deltaT: 50 }).answer.map((x) => Math.round(Number(x)))).toEqual([250, -200]);
    expect(run('money-multiplier', { currencyDepositRatio: 0.2, reserveRatio: 0.1, deltaBase: 50 }).answer[0]).toBeCloseTo(200);
    expect(run('monopoly-linear', { demandIntercept: 100, demandSlope: 1, mc: 20 }).answer).toEqual([60, 800]);
  });

  it('textbook cases', () => {
    expect(run('cournot-duopoly', { a: 120, b: 1, c: 30 }).values).toMatchObject({ qEach: 30, price: 60, monopolyQ: 45 });
    const pd = run('nash-2x2', { aUL: 5, bUL: 5, aUR: 0, bUR: 8, aDL: 8, bDL: 0, aDR: 2, bDR: 2 }).values;
    expect(pd).toMatchObject({ neCount: 1, ne_DR: 1, domA_D: 1, domB_R: 1, neParetoEfficient: 0 });
    // 성의 대결: 내쉬균형 2개, 우월전략 없음
    const bos = run('nash-2x2', { aUL: 2, bUL: 1, aUR: 0, bUR: 0, aDL: 0, bDL: 0, aDR: 1, bDR: 2 }).values;
    expect(bos).toMatchObject({ neCount: 2, domA_U: 0, domA_D: 0 });
    expect(run('solow-cobb-douglas', { alpha: 0.5, s: 0.3, n: 0.02, delta: 0.08 }).answer.map((x) => Number(x).toFixed(6))).toEqual(['9.000000', '3.000000']);
    expect(run('is-lm-linear', { c0: 100, c: 0.8, T: 100, i0: 200, b: 20, G: 100, m: 200, k: 0.25, h: 25 }).answer.map((x) => Math.round(Number(x) * 1e6) / 1e6)).toEqual([1200, 4]);
    expect(run('comparative-advantage', { aX: 2, aY: 4, bX: 6, bY: 3 }).values).toMatchObject({ oppAX: 0.5, oppBX: 2, aExportsX: 1 });
    expect(run('labor-stats', { pop15: 1000, employed: 570, unemployed: 30 }).answer.map((x) => Math.round(Number(x) * 1e9) / 1e9)).toEqual([5, 60, 57]);
  });

  it('every solver declares the params it reads', () => {
    for (const [id, s] of Object.entries(solvers)) expect(s.params.length, id).toBeGreaterThan(0);
  });
});
