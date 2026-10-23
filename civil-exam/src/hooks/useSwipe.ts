import { useRef } from 'react';
import type { PointerEvent } from 'react';

const MIN_DX = 60;
const MAX_MS = 800;

/**
 * 좌우 스와이프 감지. 대상 요소에 `touch-action: pan-y`를 줘서 세로 스크롤은 브라우저가,
 * 가로 이동은 이 핸들러가 받게 한다. 왼쪽으로 밀면 onNext, 오른쪽으로 밀면 onPrev.
 */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);

  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    },
    onPointerUp(e: PointerEvent) {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.5 || e.timeStamp - s.t > MAX_MS) return;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
