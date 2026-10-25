import "server-only";
import { listBenefits } from "./benefits";
import { listMyWishlist } from "./wishlist";
import { SHORT_RUN_DAYS, SHOW_COLUMNS } from "./shows";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { kstDateString } from "@/lib/date";
import type { ShowSummary } from "@/lib/types";

/** 오늘(KST) 마지막 공연(막공)인 공연. 1~3일짜리 단기 공연은 뺀다. */
async function showsEndingToday(limit: number): Promise<ShowSummary[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("shows").select(SHOW_COLUMNS).eq("ends_on", kstDateString()).gt("run_days", SHORT_RUN_DAYS).order("title").limit(limit);
  return (data ?? []) as unknown as ShowSummary[];
}

/** 2주 안에 개막하는 공연(개막 임박순). 단기 공연은 뺀다. */
async function showsOpeningSoon(limit: number, days = 14): Promise<ShowSummary[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const today = new Date();
  const until = kstDateString(new Date(today.getTime() + days * 86400e3));
  const { data } = await supabase.from("shows").select(SHOW_COLUMNS).gt("starts_on", kstDateString(today)).lte("starts_on", until)
    .gt("run_days", SHORT_RUN_DAYS).order("starts_on").order("id").limit(limit);
  return (data ?? []) as unknown as ShowSummary[];
}

/**
 * 홈(SPEC-2 A-6 getHome)
 * - 오늘 마감: 오늘 끝나는 혜택 + 오늘 막공인 공연(KOPIS 실제 데이터)
 * - 곧 개막: 2주 안에 개막하는 공연
 * - 곧 열리는 티켓: 관리자가 넣은 티켓오픈(공개 API가 없어 직접 입력)
 * - 내 찜 공연(지난 공연 제외, 비로그인이면 null)
 */
export async function getHome() {
  const [endingToday, endingShows, openingSoon, upcomingOpen, wishlist] = await Promise.all([
    listBenefits({ endingToday: true, limit: 3 }),
    showsEndingToday(5),
    showsOpeningSoon(8),
    listBenefits({ upcomingOpen: true, limit: 3 }),
    listMyWishlist(),
  ]);
  const today = kstDateString();
  return { endingToday, endingShows, openingSoon, upcomingOpen, wishlist: wishlist && wishlist.filter((s) => s.ends_on >= today) };
}
