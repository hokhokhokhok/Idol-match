import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Entity } from "@/lib/admin-entities";
import { fetchAll } from "./paging";
import { likePattern } from "./search";
import { formatPeriod } from "@/lib/date";
import { uniqueLabels } from "@/lib/labels";

export const ADMIN_PAGE = 100;

/** 관리자 목록: 이름 검색(q)과 더 보기(limit). 공연이 1000편 단위라 한 번에 다 보여 주지 않는다. */
export async function adminList(entity: Entity, { q, limit = ADMIN_PAGE }: { q?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase.from(entity.key).select("*").order(entity.order.column, { ascending: entity.order.ascending }).order("id");
  const term = q?.trim().slice(0, 50);
  if (term) query = query.ilike(entity.titleField, likePattern(term));
  const { data, error } = await query.limit(limit + 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function adminGet(entity: Entity, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(entity.key).select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** 폼 선택지(공연·배우는 1000개가 넘을 수 있어 이어 받는다). 검색 입력칸에서 이름으로 고르므로 이름은 서로 다르게 */
export async function adminOptionSets() {
  const supabase = await createClient();
  const [theaters, shows, actors] = await Promise.all([
    fetchAll<{ id: string; name: string }>((from, to) => supabase.from("theaters").select("id, name").order("name").order("id").range(from, to)),
    fetchAll<{ id: string; title: string; starts_on: string; ends_on: string; theater: { name: string } | null }>((from, to) =>
      supabase.from("shows").select("id, title, starts_on, ends_on, theater:theaters(name)").order("title").order("id").range(from, to) as never),
    fetchAll<{ id: string; name: string }>((from, to) => supabase.from("actors").select("id, name").order("name").order("id").range(from, to)),
  ]);
  return {
    theaters: uniqueLabels(theaters.map((t) => ({ value: t.id, label: t.name }))),
    shows: uniqueLabels(shows.map((s) => ({ value: s.id, label: `${s.title}${s.theater ? ` · ${s.theater.name}` : ""} · ${formatPeriod(s.starts_on, s.ends_on)}` }))),
    actors: uniqueLabels(actors.map((a) => ({ value: a.id, label: a.name }))),
  };
}

export async function adminCasts(showId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("casts").select("id, role_name, perf_date, actor:actors(name)").eq("show_id", showId)
    .order("perf_date", { nullsFirst: true }).order("role_name");
  return (data ?? []) as unknown as { id: string; role_name: string; perf_date: string | null; actor: { name: string } }[];
}

export async function adminZones(theaterId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("seat_zones").select("id, floor, name, sort_order").eq("theater_id", theaterId)
    .order("floor").order("sort_order").order("name");
  return (data ?? []) as { id: string; floor: string; name: string; sort_order: number }[];
}
