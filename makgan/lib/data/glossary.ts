import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { likePattern } from "./search";
import { DataError } from "./shows";

export type Term = { id: string; term: string; category: string | null; meaning: string; example: string | null; status: string };

/** 공개 용어(관리자는 초안도 보인다 — RLS), 검색어는 용어·뜻에서 */
export async function listTerms(q?: string): Promise<Term[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  let query = supabase.from("glossary").select("id, term, category, meaning, example, status").order("term");
  const t = q?.trim().slice(0, 30);
  if (t) query = query.or(`term.ilike.${JSON.stringify(likePattern(t))},meaning.ilike.${JSON.stringify(likePattern(t))}`);
  const { data, error } = await query.limit(1000);
  if (error) throw new DataError(error.message);
  return data ?? [];
}
