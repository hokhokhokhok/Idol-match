import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUser } from "@/lib/auth";
import { DataError, isUuid } from "./shows";

export type SeatReview = {
  id: string;
  user_id: string;
  floor: string | null;
  zone_text: string | null;
  seat_row: string | null;
  seat_number: string | null;
  view_score: number;
  distance_score: number;
  sound_score: number;
  is_obstructed: boolean;
  obstruction_note: string | null;
  comment: string | null;
  watched_at: string | null;
  helpful_count: number;
  created_at: string;
  show: { id: string; title: string } | null;
  mine: boolean;
  helped: boolean;
};

const COLUMNS = "id, user_id, floor, zone_text, seat_row, seat_number, view_score, distance_score, sound_score, is_obstructed, obstruction_note, comment, watched_at, helpful_count, created_at, show:shows(id, title)";

async function decorate(rows: unknown[]): Promise<SeatReview[]> {
  const user = await getUser();
  let helped = new Set<string>();
  if (user && rows.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("seat_review_helpful").select("seat_review_id").eq("user_id", user.id)
      .in("seat_review_id", (rows as { id: string }[]).map((r) => r.id));
    helped = new Set((data ?? []).map((r) => r.seat_review_id as string));
  }
  return (rows as Omit<SeatReview, "mine" | "helped">[]).map((r) => ({ ...r, mine: r.user_id === user?.id, helped: helped.has(r.id) }));
}

/** 구역 후기(도움돼요 많은 순, 최신순) */
export async function listZoneReviews(zoneId: string): Promise<SeatReview[]> {
  if (!isSupabaseConfigured || !isUuid(zoneId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("seat_reviews").select(COLUMNS).eq("zone_id", zoneId)
    .order("helpful_count", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (error) throw new DataError(error.message);
  return decorate(data ?? []);
}

/** 구역이 정해지지 않은(자유 입력) 극장 좌석 후기 */
export async function listUnzonedReviews(theaterId: string, floor?: string): Promise<SeatReview[]> {
  if (!isSupabaseConfigured || !isUuid(theaterId)) return [];
  const supabase = await createClient();
  let q = supabase.from("seat_reviews").select(COLUMNS).eq("theater_id", theaterId).is("zone_id", null);
  if (floor) q = q.eq("floor", floor);
  const { data, error } = await q.order("helpful_count", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (error) throw new DataError(error.message);
  return decorate(data ?? []);
}

export async function getZone(theaterId: string, zoneId: string) {
  if (!isSupabaseConfigured || !isUuid(theaterId) || !isUuid(zoneId)) return null;
  const supabase = await createClient();
  const [{ data: zone }, { data: theater }] = await Promise.all([
    supabase.from("seat_zones").select("id, floor, name, theater_id").eq("id", zoneId).eq("theater_id", theaterId).maybeSingle(),
    supabase.from("theaters").select("id, name").eq("id", theaterId).maybeSingle(),
  ]);
  return zone && theater ? { ...zone, theater } : null;
}

/** 좌석 후기 폼: 극장의 구역과 그 극장 공연 */
export async function seatFormOptions(theaterId: string) {
  const supabase = await createClient();
  const [{ data: zones }, { data: shows }] = await Promise.all([
    supabase.from("seat_zones").select("id, floor, name").eq("theater_id", theaterId).order("floor").order("sort_order").order("name"),
    supabase.from("shows").select("id, title").eq("theater_id", theaterId).order("starts_on", { ascending: false }),
  ]);
  return { zones: zones ?? [], shows: shows ?? [] };
}
