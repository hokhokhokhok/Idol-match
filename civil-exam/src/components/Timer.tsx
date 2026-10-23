import { useState } from 'react';
import { formatClock } from '../lib/format';

/** 경고 시점: 남은 시간 5분, 단 짧은 세트는 제한시간의 10% */
const warnAt = (limitSec: number) => Math.min(5 * 60, limitSec * 0.1);

/** 남은 시간. 탭하면 숨김/표시 전환(숨겨도 경고 시점이 되면 점이 빨갛게 바뀐다). */
export function Timer({ remaining, limitSec }: { remaining: number; limitSec: number }) {
  const [hidden, setHidden] = useState(false);
  const warn = remaining <= warnAt(limitSec);
  return (
    <button
      type="button"
      className={`timer${warn ? ' is-warn' : ''}${hidden ? ' is-hidden' : ''}`}
      onClick={() => setHidden((h) => !h)}
      aria-pressed={hidden}
      aria-label={hidden ? '남은 시간 표시하기' : `남은 시간 ${formatClock(remaining)}, 탭하면 숨김`}
    >
      <span className="timer-dot" aria-hidden />
      <span className="timer-text" role="timer" aria-live="off">
        {hidden ? '시간 숨김' : formatClock(remaining)}
      </span>
    </button>
  );
}
