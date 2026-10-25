"use client";

import { useSyncExternalStore } from "react";
import { REVERIFY_MONTHS } from "@/lib/constants";
import { isStale } from "@/lib/format";

/** 정적 빌드라 '오늘'은 브라우저에서 계산한다. */
export default function StaleNote({ lastVerified }: { lastVerified: string | null }) {
  const stale = useSyncExternalStore(
    () => () => {},
    () => isStale(lastVerified),
    () => false,
  );
  if (!stale) return null;
  return (
    <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-warn">
      {lastVerified ? `${REVERIFY_MONTHS}개월 넘음 · 재확인 필요` : "확인일 없음"}
    </span>
  );
}
