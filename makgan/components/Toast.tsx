"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** 저장·삭제 알림: 하단 탭 위에 3초(SPEC-2 A-1) */
const EVENT = "makgan:toast";
const DURATION = 3000;

/** 어디서든 토스트 띄우기(클라이언트) */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

/** 서버 액션이 redirect로 넘길 때 쓰는 ?toast= 키 → 문구 */
export const TOAST_MESSAGES = {
  "review-saved": "후기를 저장했어요",
  "review-deleted": "후기를 삭제했어요",
  saved: "저장했어요",
  deleted: "삭제했어요",
} as const;
export type ToastKey = keyof typeof TOAST_MESSAGES;

export default function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const show = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), DURATION);
  }, []);

  useEffect(() => {
    const on = (e: Event) => show((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [show]);

  // ?toast=키 를 읽고 주소에서는 지운다(새로고침해도 다시 뜨지 않게)
  const key = params.get("toast");
  useEffect(() => {
    if (!key || !(key in TOAST_MESSAGES)) return;
    show(TOAST_MESSAGES[key as ToastKey]);
    const rest = new URLSearchParams(params);
    rest.delete("toast");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [key, params, pathname, router, show]);

  return (
    <div className="toast-wrap" aria-live="polite" role="status">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
