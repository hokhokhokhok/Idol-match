import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { DataError, isUuid } from "./shows";
import type { ShowSummary } from "@/lib/types";

export const ACTOR_PAGE_SIZE = 60;

export type ActorSummary = { id: string; name: string; photo_url: string | null; following: boolean };
export type ActorDetail = ActorSummary & {
  bio: string | null;
  shows: (ShowSummary & { roles: string[] })[];
};

/** 내가 팔로우한 배우 id 집합(비로그인이면 빈 집합). RLS로 본인 행만 보인다. */
export async function myFollowIds(): Promise<Set<string>> {
  const user = await getUser();
  if (!user) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("actor_id");
  return new Set((data ?? []).map((r) => r.actor_id as string));
}

/** 배우 목록(가나다순). followingOnly면 내가 팔로우한 배우만. */
export async function listActors({ limit = ACTOR_PAGE_SIZE, followingOnly = false } = {}) {
  if (!isSupabaseConfigured) return { items: [] as ActorSummary[], hasMore: false };
  const supabase = await createClient();
  const follows = await myFollowIds();
  if (followingOnly && follows.size === 0) return { items: [], hasMore: false };

  let q = supabase.from("actors").select("id, name, photo_url").order("name").order("id");
  if (followingOnly) q = q.in("id", [...follows]);
  const { data, error } = await q.limit(limit + 1);
  if (error) throw new DataError(error.message);
  const rows = data ?? [];
  return {
    items: rows.slice(0, limit).map((a) => ({ ...a, following: follows.has(a.id) })),
    hasMore: rows.length > limit,
  };
}

/** 배우 상세 + 출연작(공연별 배역 묶음, 최근 공연 먼저) */
export async function getActor(id: string): Promise<ActorDetail | null> {
  if (!isSupabaseConfigured || !isUuid(id)) return null;
  const supabase = await createClient();
  const [{ data: actor, error }, { data: casts, error: castError }, follows] = await Promise.all([
    supabase.from("actors").select("id, name, photo_url, bio").eq("id", id).maybeSingle(),
    supabase
      .from("casts")
      .select("role_name, show:shows(id, title, starts_on, ends_on, poster_url, theater:theaters(id, name))")
      .eq("actor_id", id),
    myFollowIds(),
  ]);
  if (error || castError) throw new DataError((error ?? castError)!.message);
  if (!actor) return null;

  type Row = { role_name: string; show: ShowSummary };
  const byShow = new Map<string, ShowSummary & { roles: string[] }>();
  for (const r of (casts ?? []) as unknown as Row[]) {
    const entry = byShow.get(r.show.id) ?? { ...r.show, roles: [] };
    if (!entry.roles.includes(r.role_name)) entry.roles.push(r.role_name);
    byShow.set(r.show.id, entry);
  }
  const shows = [...byShow.values()].sort((a, b) => b.ends_on.localeCompare(a.ends_on));
  return { ...actor, following: follows.has(actor.id), shows };
}
