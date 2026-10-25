"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/shows";
import { sendToUser, pushConfigured } from "@/lib/push/send";
import type { ToggleResult } from "@/lib/types";

type SubJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
const B64URL = /^[A-Za-z0-9_-]+$/;

/** 이 기기의 푸시 구독 저장(같은 endpoint면 내 것으로 갱신) */
export async function saveSubscription(sub: SubJSON): Promise<{ ok?: true; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요해요" };
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  if (!/^https?:\/\//.test(endpoint) || endpoint.length > 2000 || !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) {
    return { error: "알림을 켜지 못했어요" };
  }
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  const { error } = await supabase.from("push_subscriptions").insert({ user_id: user.id, endpoint, p256dh, auth });
  if (error) return { error: "알림을 켜지 못했어요" };
  return { ok: true };
}

export async function removeSubscription(endpoint: string) {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", String(endpoint)).eq("user_id", user.id);
}

/** 혜택 "알림 받기" 토글: 로터리·할인 마감 60분 전, 티켓오픈 오픈 10분 전 */
export async function toggleBenefitAlert(benefitId: string): Promise<ToggleResult> {
  if (!isUuid(benefitId)) return { error: "잘못된 요청이에요" };
  const user = await getUser();
  if (!user) return { needLogin: true };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("benefit_alerts").select("benefit_id").eq("benefit_id", benefitId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("benefit_alerts").delete().eq("user_id", user.id).eq("benefit_id", benefitId);
    return error ? { error: "저장하지 못했어요" } : { on: false };
  }
  const { data: benefit } = await supabase.from("benefits").select("type").eq("id", benefitId).maybeSingle();
  if (!benefit) return { error: "없는 혜택이에요" };
  const { error } = await supabase.from("benefit_alerts").insert({ user_id: user.id, benefit_id: benefitId, remind_minutes: benefit.type === "ticket_open" ? 10 : 60 });
  revalidatePath("/benefits");
  return error ? { error: "저장하지 못했어요" } : { on: true };
}

export type SettingsState = { ok?: boolean; error?: string };
const TIME = /^\d{2}:\d{2}$/;

export async function saveNotificationSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요해요" };
  const quiet_start = String(form.get("quiet_start") ?? "");
  const quiet_end = String(form.get("quiet_end") ?? "");
  if (!TIME.test(quiet_start) || !TIME.test(quiet_end)) return { error: "방해금지 시간을 확인해 주세요" };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert({
    user_id: user.id,
    benefit_deadline: form.get("benefit_deadline") === "on",
    ticket_open: form.get("ticket_open") === "on",
    cast_added: form.get("cast_added") === "on",
    wishlist_ending: form.get("wishlist_ending") === "on",
    quiet_start, quiet_end,
  });
  if (error) return { error: "저장하지 못했어요" };
  revalidatePath("/me/settings");
  return { ok: true };
}

/** 테스트 알림: 방해금지 시간과 관계없이 내 기기로 바로 보낸다 */
export async function sendTestNotification(): Promise<{ sent?: number; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요해요" };
  const service = createServiceClient();
  if (!service || !pushConfigured()) return { error: "서버에 알림 설정(VAPID·서비스 키)이 아직 없어요" };
  const sent = await sendToUser(service, user.id, { title: "막간 테스트 알림", body: "알림이 잘 도착했어요 🎭", url: "/me/settings" });
  return sent ? { sent } : { error: "이 계정에 알림을 켠 기기가 없어요" };
}
