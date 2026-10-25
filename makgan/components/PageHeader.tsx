"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./PageHeader.module.css";

/** 상단 제목 + 우측 액션. 스크롤하면 하단 그림자(SPEC-2 A-1). 기본 액션은 🔍 검색, back을 주면 왼쪽에 뒤로 버튼. */
export default function PageHeader({ title, action, back }: { title: string; action?: ReactNode; back?: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={styles.header} data-scrolled={scrolled}>
      {back && (
        <Link href={back} aria-label="뒤로" className={styles.back}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.action}>
        {action ?? (
          <Link href="/search" aria-label="검색" className={styles.iconBtn}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        )}
      </div>
    </header>
  );
}
