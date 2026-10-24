import type { Solver } from './types.ts';

/* ---------- 화폐의 시간가치 ---------- */

/** 6계수 (r: 기간 이자율, n: 기간 수) */
export function tvmFactors(r: number, n: number) {
  const g = (1 + r) ** n;
  return {
    /** 일시불의 내가계수 */
    fvLump: g,
    /** 일시불의 현가계수 */
    pvLump: 1 / g,
    /** 연금의 내가계수 */
    fvAnnuity: r === 0 ? n : (g - 1) / r,
    /** 연금의 현가계수 */
    pvAnnuity: r === 0 ? n : (1 - 1 / g) / r,
    /** 감채기금계수 */
    sinkingFund: r === 0 ? 1 / n : r / (g - 1),
    /** 저당상수 */
    mortgageConstant: r === 0 ? 1 / n : r / (1 - 1 / g),
  };
}

/** 일시불·연금의 미래가치·현재가치 (amount: 일시불 금액, payment: 매기 금액) */
export const timeValue: Solver = {
  title: '화폐의 시간가치(6계수)',
  params: ['r', 'n'],
  solve: ({ r, n, amount = 0, payment = 0 }) => {
    const f = tvmFactors(r, n);
    const values = {
      ...f,
      futureValue: amount * f.fvLump,
      presentValue: amount * f.pvLump,
      annuityFuture: payment * f.fvAnnuity,
      annuityPresent: payment * f.pvAnnuity,
      sinkingPayment: amount * f.sinkingFund,
      mortgagePayment: amount * f.mortgageConstant,
    };
    return { answer: [amount ? values.futureValue : values.annuityPresent], values };
  },
};

/**
 * 순현재가치·수익성지수·내부수익률: 기초 투자 cf0(양수로 입력)와 1~n기 말 현금흐름 cf1…cfn, 할인율 r
 */
export const npvIrr: Solver = {
  title: '순현재가치(NPV)·수익성지수(PI)·내부수익률(IRR)',
  params: ['cf0', 'n', 'r'],
  solve: (p) => {
    const flows = Array.from({ length: p.n }, (_, i) => p[`cf${i + 1}`] ?? 0);
    const pv = (rate: number) => flows.reduce((s, c, i) => s + c / (1 + rate) ** (i + 1), 0);
    const pvIn = pv(p.r);
    const npv = pvIn - p.cf0;
    // IRR: 이분법 (NPV가 할인율에 대해 감소하는 일반적 투자)
    let lo = -0.99;
    let hi = 10;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) - p.cf0 > 0) lo = mid;
      else hi = mid;
    }
    const irr = ((lo + hi) / 2) * 100;
    return { answer: [npv], values: { npv, pvInflow: pvIn, pi: pvIn / p.cf0, irr, accept: npv > 0 ? 1 : 0 } };
  },
};

/** 기대수익률·분산·표준편차 (상황 i의 확률 pi, 수익률 ri(%)) */
export const expectedReturn: Solver = {
  title: '기대수익률과 위험(표준편차)',
  params: ['p1', 'r1', 'p2', 'r2'],
  solve: (p) => {
    const states = [1, 2, 3, 4].filter((i) => p[`p${i}`] !== undefined).map((i) => [p[`p${i}`], p[`r${i}`]] as const);
    const e = states.reduce((s, [pr, r]) => s + pr * r, 0);
    const v = states.reduce((s, [pr, r]) => s + pr * (r - e) ** 2, 0);
    return { answer: [e], values: { expected: e, variance: v, sd: Math.sqrt(v), cv: Math.sqrt(v) / e, required: p.required ?? 0, invest: e >= (p.required ?? 0) ? 1 : 0 } };
  },
};

/** 두 자산 포트폴리오 (w1: 자산 1 비중, 수익률·표준편차 %, 상관계수 rho) */
export const portfolioTwo: Solver = {
  title: '2자산 포트폴리오의 기대수익률·위험',
  params: ['w1', 'r1', 'r2', 'sd1', 'sd2', 'rho'],
  solve: ({ w1, r1, r2, sd1, sd2, rho }) => {
    const w2 = 1 - w1;
    const e = w1 * r1 + w2 * r2;
    const v = w1 ** 2 * sd1 ** 2 + w2 ** 2 * sd2 ** 2 + 2 * w1 * w2 * rho * sd1 * sd2;
    return { answer: [e], values: { expected: e, variance: v, sd: Math.sqrt(v), weightedSd: w1 * sd1 + w2 * sd2, diversification: w1 * sd1 + w2 * sd2 - Math.sqrt(v) } };
  },
};

/* ---------- 현금흐름·비율분석 ---------- */

/**
 * 영업수지 계산: 가능총소득(PGI) → 유효총소득(EGI) → 순영업소득(NOI) → 세전현금흐름(BTCF)
 * vacancy: 공실·대손충당금 비율, other: 기타소득, opex: 영업경비, debtService: 부채서비스액, equity: 지분투자액, price: 매입가격
 */
export const operatingCashFlow: Solver = {
  title: '영업현금흐름과 비율분석',
  params: ['pgi', 'vacancy', 'opex'],
  solve: ({ pgi, vacancy, other = 0, opex, debtService = 0, equity = 0, price = 0, loan = 0, capRate = 0 }) => {
    const egi = pgi * (1 - vacancy) + other;
    const noi = egi - opex;
    const btcf = noi - debtService;
    const values: Record<string, number> = {
      egi,
      noi,
      btcf,
      opexRatio: (opex / egi) * 100,
      dscr: debtService ? noi / debtService : 0,
      equityDividendRate: equity ? (btcf / equity) * 100 : 0,
      overallCapRate: price ? (noi / price) * 100 : 0,
      ltv: price ? (loan / price) * 100 : 0,
      value: capRate ? noi / capRate : 0,
      grossMultiplier: price ? price / pgi : 0,
    };
    return { answer: [noi], values };
  },
};

/** 대출 한도: 담보인정비율(LTV)과 총부채상환비율(DTI) 중 작은 금액. mc: 저당상수(없으면 r, n으로 계산) */
export const loanLimit: Solver = {
  title: 'LTV·DTI 기준 최대 대출가능액',
  params: ['value', 'ltv', 'income', 'dti'],
  solve: ({ value, ltv, income, dti, existingDebtService = 0, mc, r, n }) => {
    const constant = mc ?? (r !== undefined && n !== undefined ? tvmFactors(r, n).mortgageConstant : NaN);
    const byLtv = value * ltv;
    const byDti = (income * dti - existingDebtService) / constant;
    const max = Math.min(byLtv, byDti);
    return { answer: [max], values: { byLtv, byDti, max, constant, limitedByDti: byDti < byLtv ? 1 : 0 } };
  },
};

/**
 * 대출 상환방식 비교: 원금균등상환 vs 원리금균등상환. k기째 상환액·이자·원금, 잔금
 */
export const amortization: Solver = {
  title: '원금균등·원리금균등 상환',
  params: ['loan', 'r', 'n', 'k'],
  solve: ({ loan, r, n, k }) => {
    // 원금균등
    const principalEach = loan / n;
    const epBalanceBefore = loan - principalEach * (k - 1);
    const epInterest = epBalanceBefore * r;
    const epPayment = principalEach + epInterest;
    // 원리금균등
    const pmt = loan * tvmFactors(r, n).mortgageConstant;
    let bal = loan;
    let cpmInterest = 0;
    let cpmPrincipal = 0;
    for (let t = 1; t <= k; t++) {
      cpmInterest = bal * r;
      cpmPrincipal = pmt - cpmInterest;
      bal -= cpmPrincipal;
    }
    return {
      answer: [epPayment],
      values: {
        epPrincipal: principalEach,
        epInterest,
        epPayment,
        epBalanceAfter: loan - principalEach * k,
        cpmPayment: pmt,
        cpmInterest,
        cpmPrincipal,
        cpmBalanceAfter: bal,
        firstPaymentHigherEp: principalEach + loan * r > pmt ? 1 : 0,
      },
    };
  },
};

/* ---------- 감정평가 3방식 ---------- */

/** 원가법: 재조달원가 cost, 내용연수 life, 경과연수 elapsed, 잔가율 residual(정액법) */
export const costApproach: Solver = {
  title: '원가법(정액법 감가수정)',
  params: ['cost', 'life', 'elapsed', 'residual'],
  solve: ({ cost, life, elapsed, residual }) => {
    const annual = (cost * (1 - residual)) / life;
    const dep = annual * elapsed;
    return { answer: [cost - dep], values: { annualDepreciation: annual, accumulated: dep, value: cost - dep, remainingLife: life - elapsed } };
  },
};

/**
 * 거래사례비교법: 사례가격(㎡당) × 사정보정 × 시점수정 × 지역요인 × 개별요인 × 면적
 * situation·time·regional·individual은 배율(예: 100/95 → 1.0526…), area는 대상 면적
 */
export const salesComparison: Solver = {
  title: '거래사례비교법(비준가액)',
  params: ['unitPrice', 'situation', 'time', 'regional', 'individual', 'area'],
  solve: ({ unitPrice, situation, time, regional, individual, area }) => {
    const unit = unitPrice * situation * time * regional * individual;
    return { answer: [unit * area], values: { unitValue: unit, value: unit * area } };
  },
};

/** 수익환원법(직접환원법): 순영업소득 noi ÷ 환원율 capRate. 환원율은 요소구성법 등으로 주어질 수 있다 */
export const directCapitalization: Solver = {
  title: '직접환원법(수익가액)',
  params: ['noi', 'capRate'],
  solve: ({ noi, capRate }) => ({ answer: [noi / capRate], values: { value: noi / capRate } }),
};

/** 환원율 구하기: 물리적 투자결합법 (토지·건물 비율과 각 환원율) */
export const bandOfInvestment: Solver = {
  title: '물리적 투자결합법·금융적 투자결합법 환원율',
  params: ['w1', 'rate1', 'rate2'],
  solve: ({ w1, rate1, rate2 }) => {
    const cap = w1 * rate1 + (1 - w1) * rate2;
    return { answer: [cap], values: { capRate: cap } };
  },
};

/* ---------- 입지·상권 ---------- */

/** 허프 모형: 점포 i의 매장면적 si, 거리 di, 거리마찰계수 lambda, 소비자 수 pop → 점포 1 이용확률·이용객 */
export const huffModel: Solver = {
  title: '허프(Huff) 확률모형',
  params: ['s1', 'd1', 's2', 'd2', 'lambda'],
  solve: (p) => {
    const ids = [1, 2, 3, 4].filter((i) => p[`s${i}`] !== undefined);
    const attr = ids.map((i) => p[`s${i}`] / p[`d${i}`] ** p.lambda);
    const total = attr.reduce((a, b) => a + b, 0);
    const values: Record<string, number> = {};
    ids.forEach((i, k) => {
      values[`prob${i}`] = attr[k] / total;
      values[`customers${i}`] = (attr[k] / total) * (p.pop ?? 0);
      values[`sales${i}`] = (attr[k] / total) * (p.pop ?? 0) * (p.spend ?? 0);
    });
    return { answer: [values.prob1], values };
  },
};

/** 레일리 소매중력법칙(A·B 도시가 중간 C 지역에서 끌어가는 구매력 비)과 컨버스 분기점(A로부터 거리) */
export const retailGravity: Solver = {
  title: '레일리 소매중력법칙·컨버스 분기점',
  params: ['popA', 'popB', 'distA', 'distB'],
  solve: ({ popA, popB, distA, distB, dAB = 0, spending = 0 }) => {
    const ratio = (popA / popB) * (distB / distA) ** 2;
    const shareA = ratio / (1 + ratio);
    return {
      answer: [shareA * spending || ratio],
      values: { ratioAtoB: ratio, shareA, shareB: 1 - shareA, amountA: shareA * spending, amountB: (1 - shareA) * spending, breakPointFromA: dAB / (1 + Math.sqrt(popB / popA)) },
    };
  },
};

/* ---------- 부동산경제 ---------- */

/** 거미집 모형: Qd = a - b·P, Qs = c + d·P(공급은 전기 가격에 반응). 수렴 조건 d < b (공급 기울기 절댓값이 수요보다 가파를 때) */
export const cobweb: Solver = {
  title: '거미집 모형의 수렴·발산',
  params: ['a', 'b', 'c', 'd'],
  solve: ({ a, b, c, d }) => {
    const P = (a - c) / (b + d);
    const kind = d < b ? '수렴' : d > b ? '발산' : '순환';
    return { answer: [kind], values: { converge: d < b ? 1 : 0, diverge: d > b ? 1 : 0, price: P, quantity: a - b * P } };
  },
};

/** 수요량 변화율 = 가격탄력성 × 가격변화율 + 소득탄력성 × 소득변화율 + 교차탄력성 × 관련재 가격변화율 (탄력성은 부호 포함) */
export const elasticityMix: Solver = {
  title: '탄력성과 수요량 변화율',
  params: ['ep', 'dp'],
  solve: ({ ep, dp, ey = 0, dy = 0, ec = 0, dc = 0 }) => {
    const dq = ep * dp + ey * dy + ec * dc;
    return { answer: [dq], values: { dq, fromPrice: ep * dp, fromIncome: ey * dy, fromCross: ec * dc } };
  },
};

/* ---------- 입지·정보·레버리지·임대차 (2·3세트 추가) ---------- */

/** 입지계수 LQ = (지역 X의 A산업 고용 / 지역 X 전체 고용) ÷ (전국 A산업 고용 / 전국 전체 고용). 지역 X·Y, 산업 A·B 두 개씩 */
export const locationQuotient: Solver = {
  title: '입지계수(LQ)',
  params: ['xA', 'xB', 'yA', 'yB'],
  solve: ({ xA, xB, yA, yB }) => {
    const total = xA + xB + yA + yB;
    const natA = (xA + yA) / total;
    const natB = (xB + yB) / total;
    const lq = (r: number, rTotal: number, nat: number) => r / rTotal / nat;
    const values = {
      lqXA: lq(xA, xA + xB, natA),
      lqXB: lq(xB, xA + xB, natB),
      lqYA: lq(yA, yA + yB, natA),
      lqYB: lq(yB, yA + yB, natB),
    };
    return { answer: [values.lqXA], values: { ...values, basicXA: values.lqXA > 1 ? 1 : 0, basicYA: values.lqYA > 1 ? 1 : 0 } };
  },
};

/**
 * 개발정보의 현재가치: n년 후 개발되면 v1, 안 되면 v0인 토지. 개발 확률 p, 요구수익률 r.
 * 정보가치 = (확실할 때 현재가치 − 불확실할 때 현재가치) = (1 − p)(v1 − v0) / (1 + r)^n
 */
export const informationValue: Solver = {
  title: '개발정보의 현재가치',
  params: ['p', 'v1', 'v0', 'r', 'n'],
  solve: ({ p, v1, v0, r, n }) => {
    const d = (1 + r) ** n;
    const certain = v1 / d;
    const uncertain = (p * v1 + (1 - p) * v0) / d;
    return { answer: [certain - uncertain], values: { certainPV: certain, uncertainPV: uncertain, informationValue: certain - uncertain } };
  },
};

/** 레버리지: 총자본수익률 R(%), 대출금리 i(%), 대출비율 ltv → 자기자본수익률 = (R − i·ltv) / (1 − ltv) */
export const leverageReturn: Solver = {
  title: '레버리지와 자기자본수익률',
  params: ['totalReturn', 'loanRate', 'ltv'],
  solve: ({ totalReturn: R, loanRate: i, ltv }) => {
    const equity = (R - i * ltv) / (1 - ltv);
    return {
      answer: [equity],
      values: { equityReturn: equity, positive: R > i ? 1 : 0, negative: R < i ? 1 : 0, neutral: R === i ? 1 : 0, leverageEffect: equity - R },
    };
  },
};

/** 비율임대차: 기본임대료 + max(0, 매출 − 손익분기 매출) × 추가임대료율 */
export const percentageLease: Solver = {
  title: '비율임대차의 임대료',
  params: ['baseRent', 'sales', 'breakeven', 'rate'],
  solve: ({ baseRent, sales, breakeven, rate }) => {
    const extra = Math.max(0, sales - breakeven) * rate;
    return { answer: [baseRent + extra], values: { extraRent: extra, totalRent: baseRent + extra } };
  },
};
