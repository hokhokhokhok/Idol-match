import type { Solver } from './types.ts';

/** 선형 수요 Q = a - bP 의 점탄력성과 가격 인상 시 총수입 변화 */
export const linearDemandElasticity: Solver = {
  title: '선형 수요의 가격탄력성·총수입',
  params: ['a', 'b', 'P'],
  solve: ({ a, b, P }) => {
    const Q = a - b * P;
    const e = (b * P) / Q;
    const tr = e > 1 ? '감소' : e < 1 ? '증가' : '불변';
    return { answer: [e, tr], values: { Q, elasticity: e, revenue: P * Q } };
  },
};

/**
 * 선형 수요 Qd = di - ds·P, 공급 Qs = si + ss·P 에 공급자에게 단위당 tax 부과
 * (tax가 음수면 보조금)
 */
export const perUnitTaxLinear: Solver = {
  title: '종량세의 균형·귀착·자중손실',
  params: ['demandIntercept', 'demandSlope', 'supplyIntercept', 'supplySlope', 'tax'],
  solve: ({ demandIntercept: a, demandSlope: b, supplyIntercept: c, supplySlope: d, tax: t }) => {
    const P0 = (a - c) / (b + d);
    const Q0 = a - b * P0;
    const P = (a - c + d * t) / (b + d);
    const Q = a - b * P;
    const producerPrice = P - t;
    const values = {
      priceBefore: P0,
      quantityBefore: Q0,
      consumerPrice: P,
      producerPrice,
      quantity: Q,
      taxRevenue: t * Q,
      deadweightLoss: 0.5 * t * (Q0 - Q),
      consumerBurden: P - P0,
      producerBurden: P0 - producerPrice,
      consumerShare: (P - P0) / t,
    };
    return { answer: [P], values };
  },
};

/** 가격상한(최고가격제): 선형 수요·공급에서 초과수요(부족량) */
export const priceCeilingLinear: Solver = {
  title: '가격상한제의 초과수요',
  params: ['demandIntercept', 'demandSlope', 'supplyIntercept', 'supplySlope', 'ceiling'],
  solve: ({ demandIntercept: a, demandSlope: b, supplyIntercept: c, supplySlope: d, ceiling }) => {
    const P0 = (a - c) / (b + d);
    const binding = ceiling < P0 ? 1 : 0;
    const qd = a - b * ceiling;
    const qs = c + d * ceiling;
    const shortage = binding ? qd - qs : 0;
    return { answer: [shortage], values: { priceBefore: P0, quantityBefore: a - b * P0, qd, qs, shortage, binding, traded: binding ? qs : a - b * P0 } };
  },
};

/** 콥-더글라스 효용 U = X^α Y^(1-α): X재 가격 변화 전후 최적 소비 (α 생략 시 0.5 = U=XY) */
export const cobbDouglasDemand: Solver = {
  title: '콥-더글라스 효용극대화',
  params: ['income', 'pxBefore', 'pxAfter', 'py'],
  solve: ({ income: M, pxBefore, pxAfter, py, alpha = 0.5 }) => {
    const xB = (alpha * M) / pxBefore;
    const xA = (alpha * M) / pxAfter;
    const y = ((1 - alpha) * M) / py;
    const u = (x: number) => x ** alpha * y ** (1 - alpha);
    return {
      answer: [xA],
      values: {
        xBefore: xB,
        xAfter: xA,
        yBefore: y,
        yAfter: y,
        yChange: 0,
        utilityBefore: u(xB),
        utilityAfter: u(xA),
        utilityChange: u(xA) - u(xB),
        productBefore: xB * y,
        productAfter: xA * y,
        expenditureShareX: alpha,
      },
    };
  },
};

/** 완전보완재 U = min(aX, bY): 최적 소비 (aX = bY, 예산 소진) */
export const perfectComplements: Solver = {
  title: '완전보완재 효용극대화',
  params: ['income', 'px', 'py', 'a', 'b'],
  solve: ({ income: M, px, py, a, b }) => {
    const x = M / (px + (py * a) / b);
    const y = (a * x) / b;
    return { answer: [x, y], values: { x, y, utility: a * x } };
  },
};

/** 총비용 TC = F + aQ + bQ²: 평균비용 최소점, 손익분기·조업중단 가격 */
export const quadraticCost: Solver = {
  title: '2차 비용함수의 평균비용 최소점',
  params: ['F', 'a', 'b'],
  solve: ({ F, a, b }) => {
    const q = Math.sqrt(F / b);
    const acMin = a + 2 * Math.sqrt(F * b);
    return {
      answer: [q, acMin],
      values: { qMinAC: q, acMin, breakEvenPrice: acMin, shutdownPrice: a, mcAtMinAC: a + 2 * b * q, fixedCost: F },
    };
  },
};

/** 동질적 쿠르노 복점: P = a - bQ, 두 기업 한계비용 c 동일 */
export const cournotDuopoly: Solver = {
  title: '쿠르노 복점 균형',
  params: ['a', 'b', 'c'],
  solve: ({ a, b, c }) => {
    const qi = (a - c) / (3 * b);
    const Q = 2 * qi;
    const P = a - b * Q;
    return {
      answer: [qi, P],
      values: { qEach: qi, total: Q, price: P, profitEach: (P - c) * qi, monopolyQ: (a - c) / (2 * b), competitiveQ: (a - c) / b },
    };
  },
};

/** 독점: P = a - bQ, 한계비용 mc 일정 → 이윤극대화 가격·자중손실 */
export const monopolyLinear: Solver = {
  title: '독점의 이윤극대화와 자중손실',
  params: ['demandIntercept', 'demandSlope', 'mc'],
  solve: ({ demandIntercept: a, demandSlope: b, mc }) => {
    const Q = (a - mc) / (2 * b);
    const P = a - b * Q;
    const Qc = (a - mc) / b;
    const dwl = 0.5 * (P - mc) * (Qc - Q);
    return { answer: [P, dwl], values: { quantity: Q, price: P, competitiveQ: Qc, deadweightLoss: dwl, profit: (P - mc) * Q, lerner: (P - mc) / P } };
  },
};

/** 3급 가격차별: 두 시장 Pi = ai - bi·Qi, 한계비용 mc 일정 */
export const priceDiscrimination: Solver = {
  title: '3급 가격차별',
  params: ['a1', 'b1', 'a2', 'b2', 'mc'],
  solve: ({ a1, b1, a2, b2, mc }) => {
    const q1 = (a1 - mc) / (2 * b1);
    const q2 = (a2 - mc) / (2 * b2);
    const p1 = a1 - b1 * q1;
    const p2 = a2 - b2 * q2;
    const e = (p: number, q: number, b: number) => p / (b * q);
    return { answer: [p1, p2], values: { p1, p2, q1, q2, elasticity1: e(p1, q1, b1), elasticity2: e(p2, q2, b2), profit: (p1 - mc) * q1 + (p2 - mc) * q2 } };
  },
};

/**
 * 2×2 동시게임의 순수전략 내쉬균형. 행 경기자 A(위 U/아래 D), 열 경기자 B(왼쪽 L/오른쪽 R).
 * 보수 aUL, bUL … (a = A의 보수, b = B의 보수)
 */
export const nash2x2: Solver = {
  title: '2×2 게임 내쉬균형',
  params: ['aUL', 'bUL', 'aUR', 'bUR', 'aDL', 'bDL', 'aDR', 'bDR'],
  solve: (p) => {
    const cells = ['UL', 'UR', 'DL', 'DR'] as const;
    const a = (c: string) => p[`a${c}`];
    const b = (c: string) => p[`b${c}`];
    const other = (c: string, who: 'row' | 'col') =>
      who === 'row' ? (c[0] === 'U' ? 'D' : 'U') + c[1] : c[0] + (c[1] === 'L' ? 'R' : 'L');
    const ne = (c: string) => a(c) >= a(other(c, 'row')) && b(c) >= b(other(c, 'col'));
    const values: Record<string, number> = {};
    for (const c of cells) values[`ne_${c}`] = ne(c) ? 1 : 0;
    values.neCount = cells.filter(ne).length;
    // 강우월전략
    values.domA_U = a('UL') > a('DL') && a('UR') > a('DR') ? 1 : 0;
    values.domA_D = a('DL') > a('UL') && a('DR') > a('UR') ? 1 : 0;
    values.domB_L = b('UL') > b('UR') && b('DL') > b('DR') ? 1 : 0;
    values.domB_R = b('UR') > b('UL') && b('DR') > b('DL') ? 1 : 0;
    // 내쉬균형이 모두 파레토 효율적인가(다른 칸이 두 사람 모두에게 더 낫지 않은가)
    const pareto = (c: string) => !cells.some((d) => a(d) >= a(c) && b(d) >= b(c) && (a(d) > a(c) || b(d) > b(c)));
    values.neParetoEfficient = cells.filter(ne).every(pareto) ? 1 : 0;
    for (const c of cells) values[`pareto_${c}`] = pareto(c) ? 1 : 0;
    return { answer: [values.neCount], values };
  },
};

/** 경쟁기업의 노동수요: Q = A·L - B·L², 산출물 가격 P, 임금 w → VMP = w */
export const laborDemandQuadratic: Solver = {
  title: '노동의 한계생산물가치 = 임금',
  params: ['A', 'B', 'P', 'w'],
  solve: ({ A, B, P, w }) => {
    const L = (A - w / P) / (2 * B);
    const Q = A * L - B * L * L;
    return { answer: [L], values: { labor: L, output: Q, mpl: A - 2 * B * L, wageBill: w * L, revenue: P * Q } };
  },
};

/** 생산의 부정적 외부성: 수요 P = a - bQ, 사적 한계비용 PMC = c + dQ, 외부한계비용 e(일정) */
export const externalityLinear: Solver = {
  title: '외부성과 피구세',
  params: ['a', 'b', 'c', 'd', 'e'],
  solve: ({ a, b, c, d, e }) => {
    const qm = (a - c) / (b + d);
    const qs = (a - c - e) / (b + d);
    return {
      answer: [qm, qs],
      values: { marketQ: qm, socialQ: qs, marketP: a - b * qm, socialP: a - b * qs, pigouTax: e, deadweightLoss: 0.5 * e * (qm - qs), overproduction: qm - qs },
    };
  },
};

/** 공공재 최적 공급: 두 소비자 MBi = ai - bi·Q, 한계비용 mc 일정 → ΣMB = MC (모두 양수인 구간) */
export const publicGoodLinear: Solver = {
  title: '공공재의 최적 공급(사뮤엘슨 조건)',
  params: ['a1', 'b1', 'a2', 'b2', 'mc'],
  solve: ({ a1, b1, a2, b2, mc }) => {
    const q = (a1 + a2 - mc) / (b1 + b2);
    return { answer: [q], values: { optimalQ: q, mb1: a1 - b1 * q, mb2: a2 - b2 * q } };
  },
};

/** 선형 수요 Qd = a − bP, 공급 Qs = c + dP 의 균형과 소비자·생산자 잉여 */
export const marketSurplusLinear: Solver = {
  title: '선형 시장의 균형과 소비자·생산자 잉여',
  params: ['demandIntercept', 'demandSlope', 'supplyIntercept', 'supplySlope'],
  solve: ({ demandIntercept: a, demandSlope: b, supplyIntercept: c, supplySlope: d }) => {
    const P = (a - c) / (b + d);
    const Q = a - b * P;
    const choke = a / b; // 수요가 0이 되는 가격
    const floor = -c / d; // 공급이 시작되는 가격
    const cs = 0.5 * (choke - P) * Q;
    const ps = c >= 0 ? (P * (c + Q)) / 2 : 0.5 * (P - floor) * Q;
    return { answer: [cs, ps], values: { price: P, quantity: Q, consumerSurplus: cs, producerSurplus: ps, totalSurplus: cs + ps } };
  },
};

/** 호탄력성(중간점 공식): 가격 p1→p2, 수량 q1→q2 */
export const arcElasticity: Solver = {
  title: '중간점 공식에 의한 가격탄력성',
  params: ['p1', 'p2', 'q1', 'q2'],
  solve: ({ p1, p2, q1, q2 }) => {
    const e = Math.abs((q2 - q1) / ((q1 + q2) / 2) / ((p2 - p1) / ((p1 + p2) / 2)));
    const tr = p2 * q2 - p1 * q1;
    return { answer: [e], values: { elasticity: e, elastic: e > 1 ? 1 : 0, revenueBefore: p1 * q1, revenueAfter: p2 * q2, revenueChange: tr } };
  },
};

/** 효용 U = √W, 확률 p로 w1, 1−p로 w2: 기대효용·확실성등가·위험프리미엄 */
export const expectedUtilitySqrt: Solver = {
  title: '기대효용과 확실성등가(U = √W)',
  params: ['p', 'w1', 'w2'],
  solve: ({ p, w1, w2 }) => {
    const ew = p * w1 + (1 - p) * w2;
    const eu = p * Math.sqrt(w1) + (1 - p) * Math.sqrt(w2);
    const ce = eu * eu;
    return { answer: [ce], values: { expectedWealth: ew, expectedUtility: eu, certaintyEquivalent: ce, riskPremium: ew - ce } };
  },
};

/** 슈타켈버그 복점: 시장수요 P = a − bQ, 두 기업 한계비용 c, 기업1 선도자 */
export const stackelbergDuopoly: Solver = {
  title: '슈타켈버그 복점',
  params: ['a', 'b', 'c'],
  solve: ({ a, b, c }) => {
    const q1 = (a - c) / (2 * b);
    const q2 = (a - c) / (4 * b);
    const P = a - b * (q1 + q2);
    return {
      answer: [q1, q2],
      values: { leaderQ: q1, followerQ: q2, total: q1 + q2, price: P, leaderProfit: (P - c) * q1, followerProfit: (P - c) * q2, cournotEach: (a - c) / (3 * b) },
    };
  },
};

/** 가격하한(최저가격제): 선형 수요·공급에서 초과공급 */
export const priceFloorLinear: Solver = {
  title: '가격하한제의 초과공급',
  params: ['demandIntercept', 'demandSlope', 'supplyIntercept', 'supplySlope', 'floor'],
  solve: ({ demandIntercept: a, demandSlope: b, supplyIntercept: c, supplySlope: d, floor }) => {
    const P0 = (a - c) / (b + d);
    const binding = floor > P0 ? 1 : 0;
    const qd = a - b * floor;
    const qs = c + d * floor;
    const surplus = binding ? qs - qd : 0;
    return { answer: [surplus], values: { priceBefore: P0, quantityBefore: a - b * P0, qd, qs, surplus, binding, traded: binding ? qd : a - b * P0 } };
  },
};
