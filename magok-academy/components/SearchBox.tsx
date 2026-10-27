"use client";

import { useState } from "react";

/** 학원 이름·동네 검색. hero: 첫 화면 큰 입력창, compact: 결과 화면 머리글 */
export default function SearchBox({ initial, onSubmit, variant }: { initial: string; onSubmit: (q: string) => void; variant: "hero" | "compact" }) {
  const [q, setQ] = useState(initial);
  const hero = variant === "hero";
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q.trim());
      }}
      className={`flex items-center gap-2 rounded-full bg-white ${hero ? "py-1.5 pr-1.5 pl-4 shadow-lg shadow-black/10" : "border border-line py-1 pr-1 pl-3"}`}
    >
      <span aria-hidden className="text-sub">
        ⌕
      </span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={40}
        placeholder={hero ? "학원 이름이나 동네 (예: 목동, 해봄)" : "학원 이름·동네 검색"}
        aria-label="학원 이름이나 동네 검색"
        className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-sub ${hero ? "py-1.5 text-[15px]" : "py-1 text-sm"}`}
      />
      <button type="submit" className={`shrink-0 rounded-full bg-brand font-semibold text-white ${hero ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"}`}>
        검색
      </button>
    </form>
  );
}
