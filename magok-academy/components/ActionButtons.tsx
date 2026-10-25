"use client";

import { useState } from "react";
import { COMPARE_MAX } from "@/lib/constants";
import { useCompare, useFavorites } from "@/lib/useStoredIds";

export function FavoriteButton({ id, name }: { id: string; name: string }) {
  const fav = useFavorites();
  const on = fav.has(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기`}
      onClick={() => fav.toggle(id)}
      className={`grid size-9 place-items-center rounded-full border text-lg ${on ? "border-rose-200 bg-rose-50 text-rose-500" : "border-line text-sub"}`}
    >
      {on ? "♥" : "♡"}
    </button>
  );
}

export function CompareButton({ id, name }: { id: string; name: string }) {
  const cmp = useCompare();
  const [msg, setMsg] = useState<string | null>(null);
  const on = cmp.has(id);
  return (
    <span className="relative">
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? `${name} 비교에서 빼기` : `${name} 비교에 담기`}
        onClick={() => {
          const ok = cmp.toggle(id);
          setMsg(ok ? null : `비교는 최대 ${COMPARE_MAX}곳까지예요`);
          if (!ok) setTimeout(() => setMsg(null), 2000);
        }}
        className={`h-9 rounded-full border px-3 text-sm whitespace-nowrap ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-sub"}`}
      >
        {on ? "비교 ✓" : "비교 +"}
      </button>
      {msg && (
        <span role="status" className="absolute top-10 right-0 z-20 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white">
          {msg}
        </span>
      )}
    </span>
  );
}
