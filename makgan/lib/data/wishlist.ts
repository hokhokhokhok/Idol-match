import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { DataError } from "./shows";
import type { ShowSummary } from "@/lib/types";

/** 내가 찜한 공연 id 집합(비로그인이면 빈 집합). RLS로 본인 행만 보인다. */
export async function myWishlistIds(): Promise<Set<string>> {
  const user = await getUser();
  if (!user) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("wishlists").select("show_id");
  return new Set((data ?? []).map((r) => r.show_id as string));
}

/** 내 찜 공연(곧 끝나는 순, 지난 공연은 뒤로). 비로그인이면 null */
export async function listMyWishlist(): Promise<ShowSummary[] | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlists")
    .select("created_at, show:shows(id, title, starts_on, ends_on, poster_url, theater:theaters(id, name))")
    .order("created_at", { ascending: false });
  if (error) throw new DataError(error.message);
  const today = new Date().toISOString().slice(0, 10);
  const shows = ((data ?? []) as unknown as { show: ShowSummary }[]).map((r) => r.show);
  return shows.sort((a, b) => Number(a.ends_on < today) - Number(b.ends_on < today) || a.ends_on.localeCompare(b.ends_on));
}
