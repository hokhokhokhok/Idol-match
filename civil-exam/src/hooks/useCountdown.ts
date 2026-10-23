import { useEffect, useRef, useState } from 'react';

/**
 * endsAt(epoch ms)까지 남은 초. 1초마다, 그리고 앱이 다시 보일 때 갱신한다.
 * 0에 도달하면 onExpire를 한 번 호출한다.
 */
export function useCountdown(endsAt: number, onExpire: () => void, active = true) {
  const calc = () => Math.max(0, (endsAt - Date.now()) / 1000);
  const [remaining, setRemaining] = useState(calc);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    let fired = false;
    const tick = () => {
      const r = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(r);
      if (r <= 0 && !fired) {
        fired = true;
        expireRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt, active]);

  return remaining;
}
