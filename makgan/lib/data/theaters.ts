import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DataError, isUuid } from "./shows";
import type { Theater } from "@/lib/types";

export type Zone = { id: string; floor: string; name: string; sort_order: number };
export type ZoneWithStats = Zone & { review_count: number; avg_view: number | null; avg_distance: number | null; avg_sound: number | null };

/** 구역 정보가 없을 때 쓰는 기본 층(SPEC-2 B-1) */
export const DEFAULT_FLOORS = ["1층", "2층", "3층"];

export async function listTheaters(): Promise<(Theater & { zone_count: number })[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("theaters").select("id, name, address, seat_count, map_url, seat_zones(count)").order("name");
  if (error) throw new DataError(error.message);
  type Row = Theater & { seat_zones: { count: number }[] };
  return ((data ?? []) as unknown as Row[]).map(({ seat_zones, ...t }) => ({ ...t, zone_count: seat_zones[0]?.count ?? 0 }));
}

/** 극장 + 구역(층·정렬순) + 구역별 평균 */
export async function getTheater(id: string): Promise<(Theater & { zones: ZoneWithStats[]; floors: string[] }) | null> {
  if (!isSupabaseConfigured || !isUuid(id)) return null;
  const supabase = await createClient();
  const [{ data: theater, error }, { data: zones }, { data: stats }] = await Promise.all([
    supabase.from("theaters").select("id, name, address, seat_count, map_url").eq("id", id).maybeSingle(),
    supabase.from("seat_zones").select("id, floor, name, sort_order").eq("theater_id", id).order("floor").order("sort_order").order("name"),
    supabase.from("seat_zone_stats").select("zone_id, review_count, avg_view, avg_distance, avg_sound").eq("theater_id", id),
  ]);
  if (error) throw new DataError(error.message);
  if (!theater) return null;
  const byZone = new Map((stats ?? []).map((s) => [s.zone_id as string, s]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  const withStats: ZoneWithStats[] = ((zones ?? []) as Zone[]).map((z) => {
    const s = byZone.get(z.id);
    return { ...z, review_count: s?.review_count ?? 0, avg_view: num(s?.avg_view), avg_distance: num(s?.avg_distance), avg_sound: num(s?.avg_sound) };
  });
  const floors = [...new Set(withStats.map((z) => z.floor))].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  return { ...theater, zones: withStats, floors: floors.length ? floors : DEFAULT_FLOORS };
}
