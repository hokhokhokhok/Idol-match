"use client";
import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ToggleResult } from "@/lib/types";

/**
 * 팔로우·찜 공용 토글. 누르면 바로 바뀌고(낙관적), 비로그인이면 로그인 화면으로 보낸다.
 * action은 서버 액션(toggleFollow·toggleWishlist).
 */
export default function ToggleButton({
  on, action, labels, className,
}: {
  on: boolean;
  action: () => Promise<ToggleResult>;
  labels: { on: string; off: string; aria: string };
  className?: string;
}) {
  const [state, setState] = useState(on);
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const click = () =>
    start(async () => {
      setError("");
      setOptimistic(!optimistic);
      const r = await action();
      if ("needLogin" in r) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
      if ("error" in r) return setError(r.error);
      setState(r.on);
    });

  return (
    <>
      <button type="button" className={className} aria-pressed={optimistic} aria-label={labels.aria} onClick={click} data-pending={pending || undefined}>
        {optimistic ? labels.on : labels.off}
      </button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
