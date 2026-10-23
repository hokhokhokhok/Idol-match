import { useEffect, useState } from 'react';

export const FONT_SIZES = [15, 17, 19] as const;
export type FontSize = (typeof FONT_SIZES)[number];
const FONT_KEY = 'ce:fontSize';

function load(): FontSize {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return (FONT_SIZES as readonly number[]).includes(v) ? (v as FontSize) : 17;
  } catch {
    return 17;
  }
}

/** 시험지 글자 크기(15/17/19). 설정 화면은 5단계, 지금은 상단 토글로 바꾼다. */
export function useFontSize() {
  const [size, setSize] = useState<FontSize>(load);
  useEffect(() => {
    document.documentElement.dataset.fontSize = String(size);
    try {
      localStorage.setItem(FONT_KEY, String(size));
    } catch {
      /* 저장 없이 진행 */
    }
  }, [size]);
  return [size, setSize] as const;
}
