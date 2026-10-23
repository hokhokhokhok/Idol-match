/**
 * 시험 화면 계산기용 사칙연산 계산(eval 없이 직접 파싱).
 * 지원: + − × ÷ (* / 도 허용), 괄호, 소수점, 단항 −, %(앞 수 ÷ 100). 잘못된 식이면 null.
 */
export function evaluate(expr: string): number | null {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  function number(): number | null {
    const m = src.slice(i).match(/^\d+(?:\.\d*)?|^\.\d+/);
    if (!m) return null;
    i += m[0].length;
    let v = Number(m[0]);
    while (peek() === '%') {
      v /= 100;
      i += 1;
    }
    return v;
  }
  function factor(): number | null {
    if (peek() === '-') {
      i += 1;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      i += 1;
      return factor();
    }
    if (peek() === '(') {
      i += 1;
      const v = sum();
      if (v === null || peek() !== ')') return null;
      i += 1;
      return v;
    }
    return number();
  }
  function product(): number | null {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const r = factor();
      if (r === null) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum(): number | null {
    let v = product();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const r = product();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  if (!src) return null;
  const v = sum();
  return v !== null && i === src.length && Number.isFinite(v) ? v : null;
}

/** 표시용: 소수 10자리에서 반올림, 불필요한 0 제거 */
export const formatNumber = (v: number) => String(Math.round(v * 1e10) / 1e10);
