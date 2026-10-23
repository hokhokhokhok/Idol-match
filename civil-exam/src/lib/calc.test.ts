import { describe, expect, it } from 'vitest';
import { evaluate, formatNumber } from './calc';

describe('calculator', () => {
  it('evaluates with precedence, parentheses, unary minus and %', () => {
    expect(evaluate('1+2×3')).toBe(7);
    expect(evaluate('(1+2)×3')).toBe(9);
    expect(evaluate('1.2÷0.3')).toBeCloseTo(4);
    expect(evaluate('−4×50')).toBe(-200);
    expect(evaluate('200−4×30')).toBe(80);
    expect(evaluate('50%×120')).toBe(60);
    expect(formatNumber(evaluate('0.1+0.2')!)).toBe('0.3');
  });
  it('rejects broken input instead of throwing', () => {
    for (const bad of ['', '1+', '(1+2', '2××3', '1)', 'alert(1)']) expect(evaluate(bad)).toBeNull();
  });
});
