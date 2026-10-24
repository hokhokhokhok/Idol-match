"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./TabBar.module.css";

const TABS = [
  { href: "/", label: "홈", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { href: "/shows", label: "공연", icon: "M4 4h16v16H4zM4 9h16M9 4v5" },
  { href: "/benefits", label: "혜택", icon: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S9 3 7 5s5 3 5 3 3-5 5-3-5 3-5 3" },
  { href: "/actors", label: "배우", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" },
  { href: "/me", label: "MY", icon: "M5 4h14v17l-7-4-7 4z" },
] as const;

export function isActiveTab(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.bar} aria-label="주요 메뉴">
      {TABS.map((t) => {
        const active = isActiveTab(pathname, t.href);
        return (
          <Link key={t.href} href={t.href} className={styles.tab} data-active={active} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
