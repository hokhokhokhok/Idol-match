// 배우별 뉴스 언급량(네이버 검색 API: 뉴스 검색 total). 키가 없으면 아무것도 하지 않는다.
// 공개 수치만 쓰고, 화면에는 점수가 아니라 등급(색)으로만 드러난다.
import type { SupabaseClient } from "@supabase/supabase-js";

export type NewsKeys = { id: string; secret: string };

export async function newsTotal(name: string, keys: NewsKeys, fetchJson: (url: string, headers: Record<string, string>) => Promise<unknown> = defaultFetch): Promise<number | null> {
  const url = `https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({ query: `"${name}" 공연`, display: "1" })}`;
  try {
    const json = (await fetchJson(url, { "X-Naver-Client-Id": keys.id, "X-Naver-Client-Secret": keys.secret })) as { total?: unknown };
    return typeof json.total === "number" && json.total >= 0 ? Math.floor(json.total) : null;
  } catch {
    return null;
  }
}

async function defaultFetch(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 출연작이 2편 이상인 배우 중 가장 오래 안 본 순으로 limit명을 새로 센다. 하루 25,000건 한도 안에서. */
export async function refreshNewsSignals(
  db: SupabaseClient, keys: NewsKeys, limit = 200, fetchJson?: Parameters<typeof newsTotal>[2],
): Promise<{ checked: number; failed: number }> {
  const { data: acts } = await db.rpc("actor_activity");
  const ids = ((acts ?? []) as { actor_id: string; shows: number }[]).filter((a) => a.shows >= 2).map((a) => a.actor_id);
  if (!ids.length) return { checked: 0, failed: 0 };
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("actor_signals").select("actor_id, checked_at").in("actor_id", ids.slice(i, i + 200));
    for (const r of data ?? []) seen.set(r.actor_id as string, Date.parse(r.checked_at as string));
  }
  const todo = ids.sort((a, b) => (seen.get(a) ?? 0) - (seen.get(b) ?? 0)).slice(0, limit);
  const { data: names } = await db.from("actors").select("id, name").in("id", todo);
  let checked = 0, failed = 0;
  for (const a of names ?? []) {
    const total = await newsTotal(a.name as string, keys, fetchJson);
    if (total === null) { failed++; continue; }
    const { error } = await db.from("actor_signals").upsert({ actor_id: a.id, news_count: total, checked_at: new Date().toISOString() });
    if (error) failed++; else checked++;
  }
  return { checked, failed };
}
