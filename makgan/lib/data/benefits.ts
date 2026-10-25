import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { kstDayRange } from "@/lib/date";
import { DataError } from "./shows";

export const BENEFIT_TYPES = ["lottery", "discount", "ticket_open", "event"] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];
export const BENEFIT_TYPE_LABEL: Record<BenefitType, string> = {
  lottery: "로터리",
  discount: "할인",
  ticket_open: "티켓오픈",
  event: "이벤트",
};

export type Benefit = {
  id: string;
  type: BenefitType;
  title: string;
  source_name: string | null;
  source_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  show: { id: string; title: string } | null;
};

export type ListBenefitsParams = {
  type?: BenefitType;
  includeExpired?: boolean;   // 기본: 마감 지난 혜택 숨김(SPEC-2 D)
  endingToday?: boolean;      // 오늘(KST) 마감만
  upcomingOpen?: boolean;     // 아직 열리지 않은 티켓오픈만(오픈 시각순)
  showId?: string;
  limit?: number;
};

const COLUMNS = "id, type, title, source_name, source_url, starts_at, ends_at, note, show:shows(id, title)";

/** 혜택 목록(SPEC-2 A-6 listBenefits). 마감 임박순, 마감 없는 항목은 뒤로. */
export async function listBenefits(params: ListBenefitsParams = {}): Promise<Benefit[]> {
  if (!isSupabaseConfigured) return [];
  const { type, includeExpired = false, endingToday = false, upcomingOpen = false, showId, limit = 100 } = params;
  const now = new Date();
  const supabase = await createClient();

  let q = supabase.from("benefits").select(COLUMNS);
  if (type) q = q.eq("type", type);
  if (showId) q = q.eq("show_id", showId);
  if (!includeExpired) q = q.or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`);
  if (endingToday) {
    const { end } = kstDayRange(now);
    q = q.gte("ends_at", now.toISOString()).lt("ends_at", end.toISOString());
  }
  if (upcomingOpen) {
    q = q.eq("type", "ticket_open").gt("starts_at", now.toISOString()).order("starts_at");
  } else {
    q = q.order("ends_at", { nullsFirst: false });
  }
  const { data, error } = await q.order("id").limit(limit);
  if (error) throw new DataError(error.message);
  return (data ?? []) as unknown as Benefit[];
}
