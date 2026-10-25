"use client";
import { useEffect, useState, useTransition } from "react";
import { removeSubscription, sendTestNotification } from "@/lib/actions/push";
import { currentSubscriptionEndpoint, ensurePushSubscribed, pushSupport, PUSH_MESSAGES, type PushStatus } from "@/lib/push/client";
import { toast } from "@/components/Toast";

/** 이 기기 알림 켜기/끄기 + 테스트 알림 */
export default function DevicePush() {
  const [support, setSupport] = useState<PushStatus | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setSupport(pushSupport());
    currentSubscriptionEndpoint().then(setEndpoint).catch(() => setEndpoint(null));
  }, []);

  const enable = () => start(async () => {
    const s = await ensurePushSubscribed();
    if (s !== "ok") return toast(PUSH_MESSAGES[s]);
    setEndpoint(await currentSubscriptionEndpoint());
    toast("이 기기에서 알림을 받아요");
  });
  const disable = () => start(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removeSubscription(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
    setEndpoint(null);
    toast("이 기기 알림을 껐어요");
  });
  const test = () => start(async () => {
    const r = await sendTestNotification();
    toast(r.error ?? "테스트 알림을 보냈어요");
  });

  if (support === null) return null;
  return (
    <section className="section" aria-labelledby="device-title">
      <h3 className="section-title" id="device-title">이 기기</h3>
      {support === "ios-install" && <p className="notice">홈 화면에 추가하면 알림을 받을 수 있어요 (Safari 공유 버튼 → 홈 화면에 추가)</p>}
      {support !== "ok" && support !== "ios-install" && <p className="notice">{PUSH_MESSAGES[support]}</p>}
      {support === "ok" && (
        <div className="device-row">
          <span data-testid="device-status">{endpoint ? "알림 받는 중" : "알림 꺼짐"}</span>
          {endpoint
            ? <button type="button" className="btn btn-small" onClick={disable} disabled={pending}>이 기기 알림 끄기</button>
            : <button type="button" className="btn btn-small btn-primary" onClick={enable} disabled={pending}>이 기기에서 알림 받기</button>}
        </div>
      )}
      <button type="button" className="btn btn-block test-push" onClick={test} disabled={pending} data-pending={pending || undefined}>테스트 알림 보내기</button>
    </section>
  );
}
