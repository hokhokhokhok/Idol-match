"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/shows";
import { kstDateString } from "@/lib/date";
import { parseSeatReviewForm } from "@/lib/seat";
import type { ToggleResult } from "@/lib/types";

export type SeatFormState = { error?: string; values?: Record<string, string> };
const echo = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

/** 좌석 후기 작성: 구역은 그 극장 것만, 연결할 관극 후기는 내 것만 */
export async function createSeatReview(theaterId: string, _: SeatFormState, form: FormData): Promise<SeatFormState> {
  const user = await getUser();
  if (!user) redirect(`/login?next=/theaters/${theaterId}/seat-reviews/new`);
  if (!isUuid(theaterId)) return { error: "잘못된 요청이에요" };
  const parsed = parseSeatReviewForm(form, kstDateString());
  if ("error" in parsed) return { error: parsed.error, values: echo(form) };
  const v = parsed.value;

  const supabase = await createClient();
  if (v.zone_id) {
    const { data: zone } = await supabase.from("seat_zones").select("floor").eq("id", v.zone_id).eq("theater_id", theaterId).maybeSingle();
    if (!zone) return { error: "구역을 다시 골라 주세요", values: echo(form) };
    v.floor = zone.floor as string;
  }
  if (v.review_id) {
    const { data: own } = await supabase.from("reviews").select("id").eq("id", v.review_id).eq("user_id", user.id).maybeSingle();
    if (!own) v.review_id = null;
  }

  const { error } = await supabase.from("seat_reviews").insert({ ...v, theater_id: theaterId, user_id: user.id });
  if (error) return { error: "저장하지 못했어요. 다시 시도해 주세요", values: echo(form) };
  revalidatePath(`/theaters/${theaterId}`, "layout");
  redirect(v.zone_id ? `/theaters/${theaterId}/zones/${v.zone_id}?toast=saved` : `/theaters/${theaterId}?floor=${encodeURIComponent(v.floor)}&toast=saved`);
}

export async function deleteSeatReview(id: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요해요" };
  if (!isUuid(id)) return { error: "삭제할 수 없는 후기예요" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("seat_reviews").delete().eq("id", id).eq("user_id", user.id).select("theater_id");
  if (error || !data?.length) return { error: "삭제할 수 없는 후기예요" };
  revalidatePath(`/theaters/${data[0].theater_id}`, "layout");
  return {};
}

/** 도움돼요 토글. 내 후기에는 못 누른다(RLS도 막음). */
export async function toggleHelpful(seatReviewId: string): Promise<ToggleResult> {
  if (!isUuid(seatReviewId)) return { error: "잘못된 요청이에요" };
  const user = await getUser();
  if (!user) return { needLogin: true };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("seat_review_helpful").select("seat_review_id")
    .eq("user_id", user.id).eq("seat_review_id", seatReviewId).maybeSingle();
  const { error } = existing
    ? await supabase.from("seat_review_helpful").delete().eq("user_id", user.id).eq("seat_review_id", seatReviewId)
    : await supabase.from("seat_review_helpful").insert({ user_id: user.id, seat_review_id: seatReviewId });
  if (error) return { error: existing ? "저장하지 못했어요" : "내 후기에는 누를 수 없어요" };
  const { data: row } = await supabase.from("seat_reviews").select("theater_id").eq("id", seatReviewId).maybeSingle();
  if (row) revalidatePath(`/theaters/${row.theater_id}`, "layout");
  return { on: !existing };
}
