/** 같은 글자가 겹치면 (2), (3)…을 붙여 선택지 이름을 서로 다르게 만든다(검색 입력칸에서 이름으로 고르므로) */
export function uniqueLabels<T extends { label: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const n = (seen.get(it.label) ?? 0) + 1;
    seen.set(it.label, n);
    return n === 1 ? it : { ...it, label: `${it.label} (${n})` };
  });
}
