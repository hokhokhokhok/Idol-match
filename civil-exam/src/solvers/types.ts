/**
 * 계산 문항 풀이 함수. params를 받아
 * - answer: 정답 보기와 비교할 값 목록 (예: [60, 800], [1.5, '감소'])
 * - values: 보기별 주장(calc.claims)을 판정할 때 쓰는 이름 붙은 값
 * 을 돌려준다. Node(검증 스크립트)와 브라우저 모두에서 import하므로 순수 함수만 둔다.
 */
export type SolverResult = { answer: (number | string)[]; values: Record<string, number> };
export type Solver = {
  /** 무엇을 푸는지 한 줄 */
  title: string;
  /** 꼭 있어야 하는 params */
  params: string[];
  solve: (p: Record<string, number>) => SolverResult;
};
