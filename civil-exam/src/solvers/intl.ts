import type { Solver } from './types.ts';

/**
 * 리카도 비교우위: 두 나라 A, B가 X재·Y재 1단위 생산에 필요한 노동 aX, aY, bX, bY
 * (값이 작을수록 생산성이 높다)
 */
export const comparativeAdvantage: Solver = {
  title: '비교우위와 교역조건',
  params: ['aX', 'aY', 'bX', 'bY'],
  solve: ({ aX, aY, bX, bY }) => {
    const oppAX = aX / aY; // A의 X재 1단위 기회비용(Y재 단위)
    const oppBX = bX / bY;
    const aExportsX = oppAX < oppBX ? 1 : 0;
    return {
      answer: [aExportsX ? 'A' : 'B'],
      values: {
        oppAX,
        oppBX,
        oppAY: aY / aX,
        oppBY: bY / bX,
        aExportsX,
        bExportsX: oppBX < oppAX ? 1 : 0,
        absAX: aX < bX ? 1 : 0,
        absAY: aY < bY ? 1 : 0,
        totLow: Math.min(oppAX, oppBX),
        totHigh: Math.max(oppAX, oppBX),
      },
    };
  },
};

/** 구매력평가: 절대 PPP 환율 e = P/P*, 실질환율 = e × 외국물가 ÷ 자국물가, 상대 PPP 예상 환율변화율 = π - π* */
export const purchasingPowerParity: Solver = {
  title: '구매력평가 환율과 실질환율',
  params: ['pHome', 'pForeign', 'eActual', 'infHome', 'infForeign'],
  solve: ({ pHome, pForeign, eActual, infHome, infForeign }) => {
    const ePPP = pHome / pForeign;
    const real = (eActual * pForeign) / pHome;
    return {
      answer: [ePPP, real],
      values: { ePPP, realExchangeRate: real, overvalued: eActual < ePPP ? 1 : 0, expectedDepreciation: infHome - infForeign },
    };
  },
};
