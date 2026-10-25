import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = { title: string; body: string; url: string };

let configured: boolean | null = null;
/** VAPID 키가 있어야 보낼 수 있다(.env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) */
export function pushConfigured() {
  if (configured === null) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    configured = Boolean(pub && priv);
    if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub!, priv!);
  }
  return configured;
}

/** 사용자의 모든 기기로 보낸다. 만료된 구독(404·410)은 지운다. 보낸 기기 수를 돌려준다. */
export async function sendToUser(supabase: SupabaseClient, userId: string, payload: PushPayload) {
  if (!pushConfigured()) return 0;
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      // 암호화·VAPID 헤더는 web-push로 만들고, 전송은 fetch로(타임아웃·상태 코드 처리)
      const req = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      const res = await fetch(req.endpoint, { method: req.method, headers: req.headers as Record<string, string>, body: req.body as unknown as BodyInit, signal: AbortSignal.timeout(5000) });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
    } catch {
      // 네트워크 오류는 다음 발송 때 다시
    }
  }
  return sent;
}
