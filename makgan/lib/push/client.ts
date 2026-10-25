"use client";
import { saveSubscription } from "@/lib/actions/push";

export type PushStatus = "ok" | "denied" | "unsupported" | "ios-install" | "not-configured" | "error";

const urlB64ToUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** 지원 여부만(권한 요청 없음) */
export function pushSupport(): PushStatus {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "not-configured";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

/**
 * 이 기기를 푸시에 구독한다. 권한은 사용자가 "알림 받기"를 처음 누를 때 여기서 요청한다(첫 접속 즉시 요청 금지).
 */
export async function ensurePushSubscribed(): Promise<PushStatus> {
  const support = pushSupport();
  if (support !== "ok") return support;
  try {
    if (Notification.permission === "default" && (await Notification.requestPermission()) !== "granted") return "denied";
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
    const r = await saveSubscription(JSON.parse(JSON.stringify(sub)));
    return r.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function currentSubscriptionEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

export const PUSH_MESSAGES: Record<Exclude<PushStatus, "ok">, string> = {
  denied: "브라우저에서 알림이 차단돼 있어요. 사이트 설정에서 알림을 허용해 주세요",
  unsupported: "이 브라우저는 알림을 지원하지 않아요",
  "ios-install": "아이폰·아이패드는 홈 화면에 추가하면 알림을 받을 수 있어요",
  "not-configured": "알림 기능이 아직 준비되지 않았어요",
  error: "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요",
};
