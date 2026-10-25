import "server-only";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * 한 번에 최대 1000행(Supabase 기본 상한)만 오므로, 전체가 필요한 선택지(공연·배우 목록)는 1000개씩 이어 받는다.
 * page(from, to)는 .range(from, to)를 건 질의를 돌려준다. 정렬이 고정돼 있어야 빠지거나 겹치지 않는다.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, max = 20000): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < size) break;
  }
  return out;
}
