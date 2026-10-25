import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DataError } from "./shows";

/** ilike 패턴에서 %, _, \ 를 글자 그대로 찾도록 이스케이프 */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** 전체 검색(SPEC-2 A-4): 공연·배우·극장 섹션별 최대 3개. Postgres ilike + trigram 인덱스 */
export async function search(q: string, limit = 3) {
  const term = q.trim().slice(0, 50);
  if (!isSupabaseConfigured || !term) return { shows: [], actors: [], theaters: [] };
  const supabase = await createClient();
  const p = likePattern(term);
  const [shows, actors, theaters] = await Promise.all([
    supabase.from("shows").select("id, title, starts_on, ends_on, theater:theaters(name)").ilike("title", p).order("ends_on", { ascending: false }).limit(limit),
    supabase.from("actors").select("id, name, photo_url").ilike("name", p).order("name").limit(limit),
    supabase.from("theaters").select("id, name, address").ilike("name", p).order("name").limit(limit),
  ]);
  const err = shows.error ?? actors.error ?? theaters.error;
  if (err) throw new DataError(err.message);
  return {
    shows: (shows.data ?? []) as unknown as { id: string; title: string; starts_on: string; ends_on: string; theater: { name: string } | null }[],
    actors: actors.data ?? [],
    theaters: theaters.data ?? [],
  };
}
