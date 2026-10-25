"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCompare } from "@/lib/useStoredIds";

export default function TabBar() {
  const pathname = usePathname();
  const { ids } = useCompare();
  const tabs = [
    { href: "/", label: "찾기", icon: "⌕", active: pathname === "/" || pathname.startsWith("/academy") },
    { href: "/compare/", label: "비교", icon: "⇆", active: pathname.startsWith("/compare"), badge: ids.length || null },
    { href: "/about/", label: "데이터 안내", icon: "ⓘ", active: pathname.startsWith("/about") },
  ];
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${t.active ? "font-semibold text-brand" : "text-sub"}`}
        >
          <span aria-hidden className="relative text-lg leading-none">
            {t.icon}
            {t.badge ? (
              <span className="absolute -top-1 -right-3 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white">
                {t.badge}
              </span>
            ) : null}
          </span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
