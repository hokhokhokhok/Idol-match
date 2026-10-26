import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { DataError, isUuid } from "./shows";
import type { ShowSummary } from "@/lib/types";
import { fetchAll } from "./paging";
import { buildRelations, type CastRow, type Named, type Relations } from "@/lib/relations";

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

/** 함께 출연한 배우 관계도. 이 배우가 나온 공연의 출연진을 모아 계산한다. */
export async function getActorRelations(actorId: string, actorName: string): Promise<Relations | null> {
  if (!isSupabaseConfigured || !isUuid(actorId)) return null;
  const supabase = await createClient();
  const { data: mine, error } = await supabase.from("casts").select("show_id").eq("actor_id", actorId);
  if (error) throw new DataError(error.message);
  const showIds = [...new Set((mine ?? []).map((r) => r.show_id as string))];
  if (showIds.length === 0) return buildRelations(actorId, actorName, [], new Map());

  // 공연 수십 개를 한 번에 .in()으로 걸면 URL이 길어져 30개씩 나눠 받는다. 행 수 상한(1000)은 fetchAll이 넘긴다.
  const rows: CastRow[] = [];
  for (let i = 0; i < showIds.length; i += 30) {
    const chunk = showIds.slice(i, i + 30);
    rows.push(
      ...(await fetchAll<CastRow>((from, to) =>
        supabase.from("casts").select("actor_id, show_id").in("show_id", chunk).order("id").range(from, to),
      ).catch((e) => { throw new DataError(e.message); })),
    );
  }
  const ids = [...new Set(rows.map((r) => r.actor_id))].filter((id) => id !== actorId);
  const names = new Map<string, Named>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: nameError } = await supabase.from("actors").select("id, name, photo_url").in("id", ids.slice(i, i + 100));
    if (nameError) throw new DataError(nameError.message);
    for (const a of data ?? []) names.set(a.id as string, { name: a.name as string, photo_url: a.photo_url as string | null });
  }
  const graph = buildRelations(actorId, actorName, rows, names);

  // 노드를 눌렀을 때 보여줄 "함께한 공연" 제목
  const wanted = [...new Set(graph.nodes.flatMap((n) => n.showIds))];
  const titles: Record<string, string> = {};
  for (let i = 0; i < wanted.length; i += 100) {
    const { data } = await supabase.from("shows").select("id, title").in("id", wanted.slice(i, i + 100));
    for (const s of data ?? []) titles[s.id as string] = s.title as string;
  }
  return { ...graph, titles };
}
