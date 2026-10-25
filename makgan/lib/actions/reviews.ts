"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/shows";
import { kstDateString } from "@/lib/date";
import { parseReviewForm } from "@/lib/review-input";

export type ReviewFormState = { error?: string; values?: Record<string, string> };

const echo = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

function revalidate(showId: string) {
  revalidatePath("/me");
  revalidatePath(`/shows/${showId}`);
}

/** 후기 작성(본인 이름으로만 — user_id는 서버에서 정하고 RLS가 한 번 더 확인) */
export async function createReview(_: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const user = await getUser();
  if (!user) redirect("/login?next=/me/reviews/new");
  const parsed = parseReviewForm(form, kstDateString());
  if ("error" in parsed) return { error: parsed.error, values: echo(form) };

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({ ...parsed.value, user_id: user.id });
  if (error) return { error: "저장하지 못했어요. 다시 시도해 주세요", values: echo(form) };
  revalidate(parsed.value.show_id);
  redirect("/me?saved=review");
}

/** 후기 수정: 내 후기만. 남의 후기 id를 넣으면 0행이 바뀌고 거부된다. */
export async function updateReview(_: ReviewFormState, form: FormData): Promise<ReviewFormState> {
  const user = await getUser();
  if (!user) redirect("/login?next=/me");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "수정할 수 없는 후기예요", values: echo(form) };
  const parsed = parseReviewForm(form, kstDateString());
  if ("error" in parsed) return { error: parsed.error, values: echo(form) };

  const supabase = await createClient();
  const { data, error } = await supabase.from("reviews").update(parsed.value).eq("id", id).eq("user_id", user.id).select("id");
  if (error) return { error: "저장하지 못했어요. 다시 시도해 주세요", values: echo(form) };
  if (!data?.length) return { error: "수정할 수 없는 후기예요", values: echo(form) };
  revalidate(parsed.value.show_id);
  redirect("/me?saved=review");
}

/** 후기 삭제: 내 후기만 */
export async function deleteReview(id: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요해요" };
  if (!isUuid(id)) return { error: "삭제할 수 없는 후기예요" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("reviews").delete().eq("id", id).eq("user_id", user.id).select("show_id");
  if (error || !data?.length) return { error: "삭제할 수 없는 후기예요" };
  revalidate(data[0].show_id as string);
  return {};
}
