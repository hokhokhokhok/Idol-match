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

  it('추가 경제학 풀이 함수', () => {
    expect(run('market-surplus-linear', { demandIntercept: 100, demandSlope: 2, supplyIntercept: -20, supplySlope: 2 }).answer).toEqual([400, 400]);
    expect(run('market-surplus-linear', { demandIntercept: 100, demandSlope: 1, supplyIntercept: 20, supplySlope: 1 }).values).toMatchObject({ price: 40, quantity: 60, consumerSurplus: 1800, producerSurplus: 1600 });
    expect(run('arc-elasticity', { p1: 10, p2: 12, q1: 110, q2: 90 }).answer[0]).toBeCloseTo(1.1);
    expect(run('expected-utility-sqrt', { p: 0.5, w1: 100, w2: 0 }).values).toMatchObject({ expectedWealth: 50, expectedUtility: 5, certaintyEquivalent: 25, riskPremium: 25 });
    expect(run('stackelberg-duopoly', { a: 100, b: 1, c: 10 }).values).toMatchObject({ leaderQ: 45, followerQ: 22.5, price: 32.5, cournotEach: 30 });
    expect(run('price-floor-linear', { demandIntercept: 100, demandSlope: 1, supplyIntercept: -20, supplySlope: 1, floor: 70 }).values).toMatchObject({ surplus: 20, binding: 1, traded: 30 });
    expect(run('price-floor-linear', { demandIntercept: 100, demandSlope: 1, supplyIntercept: -20, supplySlope: 1, floor: 50 }).values.surplus).toBe(0);
    expect(run('cpi-laspeyres', { p0a: 10, q0a: 10, p0b: 20, q0b: 5, p1a: 12, q1a: 8, p1b: 25, q1b: 6 }).values).toMatchObject({ laspeyres: expect.closeTo(122.5, 9), paasche: expect.closeTo(123, 9) });
    expect(run('taylor-rule', { neutralReal: 2, inflation: 4, target: 2, h: 0.5, g: 0.5, gap: -2 }).answer).toEqual([6]);
    expect(run('growth-accounting', { gY: 5, gK: 6, gL: 2, alpha: 0.3 }).answer[0]).toBeCloseTo(1.8);
    expect(run('okun-law', { beta: 2, u: 6, un: 4 }).answer).toEqual([-4]);
    expect(run('tariff-small-country', { demandIntercept: 200, demandSlope: 1, supplyIntercept: -40, supplySlope: 1, worldPrice: 60, tariff: 20 }).values).toMatchObject({
      importsBefore: 120,
      importsAfter: 80,
      tariffRevenue: 1600,
      deadweightLoss: 400,
    });
    expect(run('interest-parity', { iHome: 5, iForeign: 2, spot: 1200 }).answer[0]).toBeCloseTo(1236);
  });

  it('부동산학원론 cases', () => {
    expect(run('time-value', { r: 0.05, n: 3, amount: 100000000 }).answer[0]).toBeCloseTo(115762500, 0);
    expect(run('time-value', { r: 0.1, n: 3, payment: 1000 }).values.annuityPresent).toBeCloseTo(2486.85, 2);
    expect(run('npv-irr', { cf0: 2000, n: 2, r: 0.1, cf1: 1100, cf2: 1210 }).values).toMatchObject({ pvInflow: expect.closeTo(2000, 6), npv: expect.closeTo(0, 6) });
    expect(run('npv-irr', { cf0: 2000, n: 2, r: 0.1, cf1: 1100, cf2: 1210 }).values.irr).toBeCloseTo(10, 4);
    expect(run('cost-approach', { cost: 200000000, life: 50, elapsed: 10, residual: 0.1 }).answer[0]).toBeCloseTo(164000000, 0);
    expect(run('huff-model', { s1: 1000, d1: 5, s2: 2000, d2: 10, s3: 4500, d3: 15, lambda: 2, pop: 1000 }).values.prob1).toBeCloseTo(0.5);
    expect(run('cobweb', { a: 120, b: 2, c: 0, d: 1 }).answer).toEqual(['수렴']);
    expect(run('loan-limit', { value: 50000, ltv: 0.6, income: 6000, dti: 0.4, mc: 0.1 }).answer[0]).toBeCloseTo(24000);
    expect(run('amortization', { loan: 10000, r: 0.05, n: 20, k: 1 }).values).toMatchObject({ epPayment: 1000, epInterest: 500, cpmInterest: 500 });
    const ocf = run('operating-cash-flow', { pgi: 20000, vacancy: 0.1, other: 200, opex: 5000, debtService: 6000, equity: 50000, price: 150000 }).values;
    expect(ocf.noi).toBeCloseTo(13200);
    expect(ocf.dscr).toBeCloseTo(2.2);
    expect(ocf.equityDividendRate).toBeCloseTo(14.4);
    expect(run('sales-comparison', { unitPrice: 200, situation: 0.8, time: 1.25, regional: 1.1, individual: 0.9, area: 100 }).answer[0]).toBeCloseTo(19800);
    expect(run('band-of-investment', { w1: 0.6, rate1: 5, rate2: 10 }).answer[0]).toBeCloseTo(7);
    expect(run('expected-return', { p1: 0.3, r1: 20, p2: 0.5, r2: 10, p3: 0.2, r3: -5, required: 9 }).values).toMatchObject({ expected: expect.closeTo(10, 9), variance: expect.closeTo(75, 9), invest: 1 });
    expect(run('portfolio-two', { w1: 0.6, r1: 10, r2: 5, sd1: 20, sd2: 10, rho: 0 }).values.expected).toBeCloseTo(8);
  });

  it('every solver declares the params it reads', () => {
    for (const [id, s] of Object.entries(solvers)) expect(s.params.length, id).toBeGreaterThan(0);
  });
});
