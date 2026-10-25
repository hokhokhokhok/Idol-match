import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateString } from "@/lib/date";
import { isQuietTime } from "./quiet";
import { sendToUser } from "./send";

type Settings = { benefit_deadline: boolean; ticket_open: boolean; cast_added: boolean; wishlist_ending: boolean; quiet_start: string; quiet_end: string };
const DEFAULTS: Settings = { benefit_deadline: true, ticket_open: true, cast_added: true, wishlist_ending: true, quiet_start: "23:00", quiet_end: "08:00" };

async function settingsFor(supabase: SupabaseClient, userIds: string[]) {
  const map = new Map<string, Settings>();
  if (!userIds.length) return map;
  const { data } = await supabase.from("notification_settings").select("*").in("user_id", userIds);
  for (const s of data ?? []) map.set(s.user_id as string, s as Settings);
  return (id: string) => map.get(id) ?? DEFAULTS;
}

/**
 * 5분마다(SPEC-2 B-2):
 * 1) 혜택 알림: 마감(티켓오픈은 오픈) - remind_minutes 가 지났고 아직 안 보낸 것 → 대기열, sent_at 기록
 * 2) 찜 공연 종료 7일 전 → 대기열(하루 한 번만, 고유 인덱스로 중복 방지)
 * 3) 대기열 발송: 방해금지 시간인 사용자는 건너뛰고, 끝나면 여러 개를 한 번에 묶어 보낸다
 */
export async function runAlerts(supabase: SupabaseClient, now = new Date()) {
  const nowIso = now.toISOString();
  const summary = { benefitQueued: 0, wishlistQueued: 0, delivered: 0, deferred: 0 };

  // 1) 혜택
  const { data: alerts } = await supabase.from("benefit_alerts")
    .select("user_id, benefit_id, remind_minutes, benefit:benefits(id, type, title, starts_at, ends_at, show_id)")
    .is("sent_at", null);
  type Alert = { user_id: string; benefit_id: string; remind_minutes: number; benefit: { id: string; type: string; title: string; starts_at: string | null; ends_at: string | null; show_id: string | null } };
  const list = (alerts ?? []) as unknown as Alert[];
  const settingOf = await settingsFor(supabase, [...new Set(list.map((a) => a.user_id))]);
  for (const a of list) {
    const isOpen = a.benefit.type === "ticket_open";
    const at = isOpen ? a.benefit.starts_at : a.benefit.ends_at;
    if (!at) continue;
    const t = new Date(at).getTime();
    const due = t - a.remind_minutes * 60e3 <= now.getTime();
    if (!due) continue;
    const s = typeof settingOf === "function" ? settingOf(a.user_id) : DEFAULTS;
    const wanted = isOpen ? s.ticket_open : s.benefit_deadline;
    if (t > now.getTime() && wanted) {
      const mins = Math.max(1, Math.round((t - now.getTime()) / 60e3));
      const { error } = await supabase.from("notification_outbox").upsert({
        user_id: a.user_id, kind: isOpen ? "ticket_open" : "benefit_deadline", ref_id: a.benefit_id,
        title: isOpen ? `${mins}분 뒤 티켓오픈` : `${mins}분 뒤 마감`, body: a.benefit.title,
        url: a.benefit.show_id ? `/shows/${a.benefit.show_id}` : "/benefits",
      }, { onConflict: "user_id,kind,ref_id", ignoreDuplicates: true });
      if (error) { console.error("benefit alert enqueue failed", error.message); continue; }
      summary.benefitQueued++;
    }
    // 이미 지난 것도 sent_at을 채워 다시 보지 않는다
    await supabase.from("benefit_alerts").update({ sent_at: nowIso }).eq("user_id", a.user_id).eq("benefit_id", a.benefit_id);
  }

  // 2) 찜 공연 종료 7일 전
  const target = kstDateString(new Date(now.getTime() + 7 * 86400e3));
  const { data: ending } = await supabase.from("wishlists").select("user_id, show:shows!inner(id, title, ends_on)").eq("show.ends_on", target);
  type Wish = { user_id: string; show: { id: string; title: string } };
  const wishes = (ending ?? []) as unknown as Wish[];
  const wishSetting = await settingsFor(supabase, [...new Set(wishes.map((w) => w.user_id))]);
  for (const w of wishes) {
    const s = typeof wishSetting === "function" ? wishSetting(w.user_id) : DEFAULTS;
    if (!s.wishlist_ending) continue;
    const { error } = await supabase.from("notification_outbox").upsert({
      user_id: w.user_id, kind: "wishlist_ending", ref_id: w.show.id, title: "찜한 공연이 7일 뒤 끝나요", body: w.show.title, url: `/shows/${w.show.id}`,
    }, { onConflict: "user_id,kind,ref_id", ignoreDuplicates: true });
    if (error) console.error("wishlist alert enqueue failed", error.message);
    else summary.wishlistQueued++;
  }

  // 3) 발송
  const { data: pending } = await supabase.from("notification_outbox").select("id, user_id, title, body, url, created_at").is("sent_at", null).order("created_at");
  const byUser = new Map<string, { id: string; title: string; body: string; url: string }[]>();
  for (const p of pending ?? []) byUser.set(p.user_id as string, [...(byUser.get(p.user_id as string) ?? []), p as never]);
  const deliverSetting = await settingsFor(supabase, [...byUser.keys()]);
  for (const [userId, items] of byUser) {
    const s = typeof deliverSetting === "function" ? deliverSetting(userId) : DEFAULTS;
    if (isQuietTime(now, s.quiet_start, s.quiet_end)) {
      summary.deferred += items.length;
      continue;
    }
    const payload = items.length === 1
      ? { title: items[0].title, body: items[0].body, url: items[0].url }
      : { title: `막간 알림 ${items.length}개`, body: items.slice(0, 3).map((i) => `${i.title} · ${i.body}`).join("\n"), url: "/" };
    await sendToUser(supabase, userId, payload);
    await supabase.from("notification_outbox").update({ sent_at: nowIso }).in("id", items.map((i) => i.id));
    summary.delivered += items.length;
  }
  return summary;
}
