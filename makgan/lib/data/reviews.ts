import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { DataError, isUuid } from "./shows";
import { fetchAll } from "./paging";

export type Review = {
  id: string;
  user_id: string;
  show_id: string;
  watched_at: string;
  rating: number;
  body: string | null;
  cast_note: string | null;
  seat_text: string | null;
  price: number | null;
  is_public: boolean;
  created_at: string;
};
export type ShowReview = Review & { author: string | null; mine: boolean };
export type MyReview = Review & { show: { id: string; title: string } };

const COLUMNS = "id, user_id, show_id, watched_at, rating, body, cast_note, seat_text, price, is_public, created_at";

/** 공연 상세 후기: 공개 후기 + 내 비공개 후기(RLS가 거른다). 최신 관람일순 */
export async function listShowReviews(showId: string, limit = 20): Promise<ShowReview[]> {
  if (!isSupabaseConfigured || !isUuid(showId)) return [];
  const supabase = await createClient();
  const [{ data, error }, user] = await Promise.all([
    supabase.from("reviews").select(`${COLUMNS}, author:profiles(nickname)`).eq("show_id", showId)
      .order("watched_at", { ascending: false }).order("created_at", { ascending: false }).limit(limit),
    getUser(),
  ]);
  if (error) throw new DataError(error.message);
  type Row = Review & { author: { nickname: string | null } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, author: r.author?.nickname ?? null, mine: r.user_id === user?.id }));
}

/** 내 관극 기록(최신 관람일순). 비로그인이면 null */
export async function listMyReviews(): Promise<MyReview[] | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("reviews").select(`${COLUMNS}, show:shows(id, title)`).eq("user_id", user.id)
    .order("watched_at", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new DataError(error.message);
  return (data ?? []) as unknown as MyReview[];
}

/** 수정 화면용: 내 후기만. 남의 후기·없는 후기는 null */
export async function getMyReview(id: string): Promise<Review | null> {
  const user = await getUser();
  if (!user || !isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select(COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  return data as Review | null;
}

/** 후기 폼의 공연 선택지(전체) */
export async function listShowOptions() {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  return fetchAll<{ id: string; title: string; starts_on: string; ends_on: string; theater_id: string | null }>((from, to) =>
    supabase.from("shows").select("id, title, starts_on, ends_on, theater_id").order("title").order("id").range(from, to));
}

/** 후기 폼 배우 자동완성 */
export async function listActorOptions() {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  return fetchAll<{ id: string; name: string }>((from, to) => supabase.from("actors").select("id, name").order("name").order("id").range(from, to));
}

/** 내 후기의 그날 캐스트(수정 화면) */
export async function getReviewCasts(reviewId: string) {
  if (!isSupabaseConfigured || !isUuid(reviewId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("review_casts").select("actor_id, role_name, actor:actors(name)").eq("review_id", reviewId);
  return ((data ?? []) as unknown as { actor_id: string; role_name: string; actor: { name: string } }[])
    .map((c) => ({ actor_id: c.actor_id, role_name: c.role_name, name: c.actor.name }));
}

/** 통계용: 내 후기들의 그날 캐스트 */
export async function listMyReviewCasts() {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("review_casts").select("review_id, actor_id, actor:actors(name), review:reviews!inner(user_id)").eq("review.user_id", user.id);
  return ((data ?? []) as unknown as { review_id: string; actor_id: string; actor: { name: string } }[])
    .map((c) => ({ review_id: c.review_id, actor_id: c.actor_id, name: c.actor.name }));
}
