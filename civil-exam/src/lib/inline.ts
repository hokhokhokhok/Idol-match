/**
 * 문항 텍스트의 제한된 인라인 마크업 파서. 지원: **굵게**, <u>밑줄</u> (중첩 가능).
 * HTML을 그대로 주입하지 않도록 트리로 바꿔 React가 렌더링하게 한다.
 * 짝이 맞지 않는 표식은 일반 문자로 남긴다.
 */
export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'underline'; children: InlineNode[] };

const MARKERS = [
  { open: '**', close: '**', kind: 'bold' },
  { open: '<u>', close: '</u>', kind: 'underline' },
] as const;

export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = '';
  let i = 0;
  while (i < src.length) {
    const m = MARKERS.find((mk) => src.startsWith(mk.open, i));
    const end = m ? src.indexOf(m.close, i + m.open.length) : -1;
    if (m && end > i + m.open.length) {
      if (buf) out.push({ kind: 'text', text: buf });
      buf = '';
      out.push({ kind: m.kind, children: parseInline(src.slice(i + m.open.length, end)) });
      i = end + m.close.length;
    } else {
      buf += src[i];
      i += 1;
    }
  }
  if (buf) out.push({ kind: 'text', text: buf });
  return out;
}
