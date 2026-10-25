import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Entity } from "@/lib/admin-entities";

export async function adminList(entity: Entity) {
  const supabase = await createClient();
  const { data, error } = await supabase.from(entity.key).select("*").order(entity.order.column, { ascending: entity.order.ascending }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function adminGet(entity: Entity, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(entity.key).select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** 폼 선택지 */
export async function adminOptionSets() {
  const supabase = await createClient();
  const [{ data: theaters }, { data: shows }, { data: actors }] = await Promise.all([
    supabase.from("theaters").select("id, name").order("name"),
    supabase.from("shows").select("id, title").order("title"),
    supabase.from("actors").select("id, name").order("name"),
  ]);
  return {
    theaters: (theaters ?? []).map((t) => ({ value: t.id as string, label: t.name as string })),
    shows: (shows ?? []).map((s) => ({ value: s.id as string, label: s.title as string })),
    actors: (actors ?? []).map((a) => ({ id: a.id as string, name: a.name as string })),
    actorOptions: (actors ?? []).map((a) => ({ value: a.id as string, label: a.name as string })),
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
