import { useState } from 'react';
import { evaluate, formatNumber } from '../lib/calc';

const KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='] as const;

/** 시험 화면용 간단 계산기 (사칙연산·괄호). 실제 시험의 계산기 허용 여부는 Q-Net 공고로 확인 */
export function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'C') {
      setExpr('');
      setResult(null);
    } else if (k === '⌫') setExpr((e) => e.slice(0, -1));
    else if (k === '=') {
      const v = evaluate(expr);
      setResult(v === null ? '식을 확인하세요' : formatNumber(v));
      if (v !== null) setExpr(formatNumber(v));
    } else {
      setResult(null);
      setExpr((e) => e + k);
    }
  };
  return (
    <div className="calc" role="dialog" aria-label="계산기">
      <div className="calc-head">
        <strong>계산기</strong>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="계산기 닫기">
          닫기
        </button>
      </div>
      <output className="calc-display" aria-live="polite">
        <span className="calc-expr">{expr || '0'}</span>
        {result && <span className="calc-result">{result}</span>}
      </output>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`calc-key${'÷×−+='.includes(k) ? ' is-op' : ''}`} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
