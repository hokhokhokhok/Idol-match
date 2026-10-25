"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toggleBenefitAlert } from "@/lib/actions/push";
import { ensurePushSubscribed, PUSH_MESSAGES } from "@/lib/push/client";
import { toast } from "./Toast";

/** 혜택 "알림 받기": 처음 누를 때 알림 권한 요청 → 구독 → 알림 등록. 비로그인이면 로그인으로. */
export default function AlertButton({ benefitId, on: initial, kind }: { benefitId: string; on: boolean; kind: "deadline" | "open" }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const click = () => start(async () => {
    if (!on) {
      const status = await ensurePushSubscribed();
      if (status !== "ok" && status !== "not-configured") {
        // 권한이 없어도 알림 등록은 해 둔다(나중에 기기에서 켜면 받음). 안내만 띄운다.
        toast(PUSH_MESSAGES[status]);
      }
    }
    const r = await toggleBenefitAlert(benefitId);
    if ("needLogin" in r) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    if ("error" in r) return toast(r.error);
    setOn(r.on);
    if (r.on) toast(kind === "open" ? "오픈 10분 전에 알려드릴게요" : "마감 1시간 전에 알려드릴게요");
  });

  return (
    <button type="button" className="alert-btn" aria-pressed={on} onClick={click} disabled={pending} data-pending={pending || undefined}>
      {on ? "🔔 알림 켜짐" : "🔕 알림 받기"}
    </button>
  );
}
