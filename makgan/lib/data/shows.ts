import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { kstDateString } from "@/lib/date";
import type { CastResult, ShowDetail, ShowSummary } from "@/lib/types";

export const SHOW_PAGE_SIZE = 20;
export const SHOW_STATUSES = ["current", "running", "upcoming", "ended", "all"] as const;
export const SHOW_SORTS = ["ending", "newest", "title"] as const;
export type ShowStatusFilter = (typeof SHOW_STATUSES)[number];
export type ShowSort = (typeof SHOW_SORTS)[number];

export type ListShowsParams = {
  status?: ShowStatusFilter;   // current = 공연 중 + 예정(기본)
  theaterId?: string;
  actorId?: string;
  from?: string;               // 'YYYY-MM-DD': 이 기간에 공연하는 것(기간 겹침)
  to?: string;
  sort?: ShowSort;
  cursor?: number;             // 다음 페이지 시작 위치
};

const SHOW_COLUMNS = "id, title, starts_on, ends_on, poster_url, theater:theaters(id, name)";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v) && !Number.isNaN(Date.parse(v));

export class DataError extends Error {}

/** 공연 목록(SPEC-2 A-6 listShows) */
export async function listShows(params: ListShowsParams = {}): Promise<{ items: ShowSummary[]; nextCursor: number | null }> {
  if (!isSupabaseConfigured) return { items: [], nextCursor: null };
  const { status = "current", theaterId, actorId, from, to, sort = "ending", cursor = 0 } = params;
  const today = kstDateString();
  const supabase = await createClient();

  // 배우 필터는 캐스팅과 inner join (공연당 1행이 되도록 show 단위로 가져온다)
  let q = supabase.from("shows").select(actorId ? `${SHOW_COLUMNS}, casts!inner(actor_id)` : SHOW_COLUMNS);
  if (actorId) q = q.eq("casts.actor_id", actorId);
  if (status === "current") q = q.gte("ends_on", today);
  if (status === "running") q = q.lte("starts_on", today).gte("ends_on", today);
  if (status === "upcoming") q = q.gt("starts_on", today);
  if (status === "ended") q = q.lt("ends_on", today);
  if (theaterId) q = q.eq("theater_id", theaterId);
  if (from) q = q.gte("ends_on", from);
  if (to) q = q.lte("starts_on", to);

  if (sort === "ending") q = status === "ended" ? q.order("ends_on", { ascending: false }) : q.order("ends_on");
  if (sort === "newest") q = q.order("starts_on", { ascending: false });
  if (sort === "title") q = q.order("title");
  q = q.order("id");

  // 한 개 더 가져와서 다음 페이지가 있는지 본다
  const { data, error } = await q.range(cursor, cursor + SHOW_PAGE_SIZE);
  if (error) throw new DataError(error.message);
  const rows = (data ?? []) as unknown as (ShowSummary & { casts?: unknown })[];
  const items = rows.slice(0, SHOW_PAGE_SIZE).map(({ casts: _casts, ...s }) => s);
  return { items, nextCursor: rows.length > SHOW_PAGE_SIZE ? cursor + SHOW_PAGE_SIZE : null };
}

/** 공연 상세 + 평균 별점 + 후기 수(공개 후기 기준). 없으면 null */
export async function getShow(id: string): Promise<ShowDetail | null> {
  if (!isSupabaseConfigured || !isUuid(id)) return null;
  const supabase = await createClient();
  const [{ data: show, error }, { data: stats }] = await Promise.all([
    supabase.from("shows").select(`${SHOW_COLUMNS}, synopsis`).eq("id", id).maybeSingle(),
    supabase.from("show_rating_stats").select("avg_rating, review_count").eq("show_id", id).maybeSingle(),
  ]);
  if (error) throw new DataError(error.message);
  if (!show) return null;
  return {
    ...(show as unknown as Omit<ShowDetail, "avg_rating" | "review_count">),
    avg_rating: stats?.avg_rating == null ? null : Number(stats.avg_rating),
    review_count: stats?.review_count ?? 0,
  };
}

/** 그날 캐스팅, 없으면 시즌 캐스팅(SPEC-2 A-6 getCast) */
export async function getCast(showId: string, date?: string | null): Promise<CastResult> {
  const empty: CastResult = { kind: "season", date: null, members: [] };
  if (!isSupabaseConfigured || !isUuid(showId)) return empty;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("casts")
    .select("actor_id, role_name, perf_date, actor:actors(name, photo_url)")
    .eq("show_id", showId)
    .or(date && isDay(date) ? `perf_date.is.null,perf_date.eq.${date}` : "perf_date.is.null")
    .order("role_name")
    .order("created_at");
  if (error) throw new DataError(error.message);

  type Row = { actor_id: string; role_name: string; perf_date: string | null; actor: { name: string; photo_url: string | null } };
  const rows = (data ?? []) as unknown as Row[];
  const dated = rows.filter((r) => r.perf_date !== null);
  const pick = dated.length ? dated : rows.filter((r) => r.perf_date === null);
  return {
    kind: dated.length ? "date" : "season",
    date: dated.length ? date! : null,
    members: pick.map((r) => ({ actor_id: r.actor_id, role_name: r.role_name, name: r.actor.name, photo_url: r.actor.photo_url })),
  };
}

/** 극장 필터용 목록 */
export async function listTheaterOptions() {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("theaters").select("id, name").order("name");
  return data ?? [];
}
