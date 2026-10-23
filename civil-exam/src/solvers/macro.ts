import type { Solver } from './types.ts';

/** 단순 케인즈 모형(정액세): 정부지출 deltaG, 정액세 deltaT 변화의 소득 효과 */
export const keynesianMultiplier: Solver = {
  title: '정부지출승수·정액세승수',
  params: ['mpc', 'deltaG', 'deltaT'],
  solve: ({ mpc: c, deltaG, deltaT }) => {
    const gm = 1 / (1 - c);
    const tm = -c / (1 - c);
    return {
      answer: [gm * deltaG, tm * deltaT],
      values: { govMultiplier: gm, taxMultiplier: tm, dYfromG: gm * deltaG, dYfromT: tm * deltaT, balancedBudget: (gm + tm) * deltaG },
    };
  },
};

/** 비례세·수입이 있는 승수: 1 / (1 - c(1 - t) + m) */
export const proportionalTaxMultiplier: Solver = {
  title: '비례세(·수입) 모형의 정부지출승수',
  params: ['mpc', 'taxRate', 'deltaG'],
  solve: ({ mpc: c, taxRate: t, deltaG, mpi = 0 }) => {
    const k = 1 / (1 - c * (1 - t) + mpi);
    const dY = k * deltaG;
    return { answer: [k, dY], values: { multiplier: k, dY, dTaxRevenue: t * dY, dBudgetBalance: t * dY - deltaG } };
  },
};

/**
 * IS-LM (선형): C = c0 + c(Y - T), I = i0 - b·r, G, 실질화폐공급 m = M/P, 화폐수요 L = kY - h·r
 */
export const isLmLinear: Solver = {
  title: 'IS-LM 균형',
  params: ['c0', 'c', 'T', 'i0', 'b', 'G', 'm', 'k', 'h'],
  solve: ({ c0, c, T, i0, b, G, m, k, h }) => {
    const A = c0 - c * T + i0 + G;
    // IS: (1-c)Y = A - b r,  LM: r = (kY - m)/h
    const Y = (A + (b * m) / h) / (1 - c + (b * k) / h);
    const r = (k * Y - m) / h;
    return { answer: [Y, r], values: { Y, r, consumption: c0 + c * (Y - T), investment: i0 - b * r } };
  },
};

/** 두 재화 경제의 명목·실질 GDP와 GDP 디플레이터(기준연도 = 1년차) */
export const gdpTwoGoods: Solver = {
  title: '명목GDP·실질GDP·GDP디플레이터',
  params: ['p1a', 'q1a', 'p1b', 'q1b', 'p2a', 'q2a', 'p2b', 'q2b'],
  solve: ({ p1a, q1a, p1b, q1b, p2a, q2a, p2b, q2b }) => {
    // 재화 a, b / 1년차(기준), 2년차
    const nominal1 = p1a * q1a + p1b * q1b;
    const nominal2 = p2a * q2a + p2b * q2b;
    const real2 = p1a * q2a + p1b * q2b;
    const deflator2 = (nominal2 / real2) * 100;
    return {
      answer: [deflator2],
      values: {
        nominal1,
        nominal2,
        real1: nominal1,
        real2,
        deflator2,
        realGrowth: (real2 / nominal1 - 1) * 100,
        nominalGrowth: (nominal2 / nominal1 - 1) * 100,
        inflation: deflator2 - 100,
      },
    };
  },
};

/** 통화승수 m = (1 + c) / (c + z): c = 현금/예금, z = 지급준비율 */
export const moneyMultiplier: Solver = {
  title: '통화승수',
  params: ['currencyDepositRatio', 'reserveRatio', 'deltaBase'],
  solve: ({ currencyDepositRatio: c, reserveRatio: z, deltaBase }) => {
    const m = (1 + c) / (c + z);
    return { answer: [m * deltaBase], values: { multiplier: m, deltaMoney: m * deltaBase } };
  },
};

/** 화폐수량설(증가율 근사) + 피셔방정식 */
export const quantityTheoryFisher: Solver = {
  title: '화폐수량설·피셔방정식',
  params: ['moneyGrowth', 'velocityGrowth', 'outputGrowth', 'realRate'],
  solve: ({ moneyGrowth, velocityGrowth, outputGrowth, realRate }) => {
    const inflation = moneyGrowth + velocityGrowth - outputGrowth;
    return { answer: [inflation, realRate + inflation], values: { inflation, nominalRate: realRate + inflation, nominalGdpGrowth: moneyGrowth + velocityGrowth } };
  },
};

/** 고용 통계: 15세 이상 인구, 취업자, 실업자 (단위 동일) */
export const laborStats: Solver = {
  title: '실업률·경제활동참가율·고용률',
  params: ['pop15', 'employed', 'unemployed'],
  solve: ({ pop15, employed, unemployed }) => {
    const lf = employed + unemployed;
    const u = (unemployed / lf) * 100;
    const part = (lf / pop15) * 100;
    const emp = (employed / pop15) * 100;
    return { answer: [u, part, emp], values: { laborForce: lf, notInLaborForce: pop15 - lf, unemploymentRate: u, participationRate: part, employmentRate: emp } };
  },
};

/** 콥-더글라스 솔로우 모형 y = k^α: 정상상태 (인구증가율 n, 감가상각률 δ, 기술진보 g) */
export const solowCobbDouglas: Solver = {
  title: '솔로우 모형 정상상태',
  params: ['alpha', 's', 'n', 'delta'],
  solve: ({ alpha, s, n, delta, g = 0 }) => {
    const k = (s / (n + delta + g)) ** (1 / (1 - alpha));
    const y = k ** alpha;
    return {
      answer: [k, y],
      values: { kStar: k, yStar: y, cStar: (1 - s) * y, investment: s * y, goldenSaving: alpha, mpk: alpha * k ** (alpha - 1) },
    };
  },
};
