"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY = "makgan:recent-searches";
const MAX = 5;

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}
function save(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장 못 해도 검색은 된다 */ }
}

/** 검색창 + 최근 검색어 5개(이 기기에만 저장, SPEC-2 A-4) */
export default function SearchBox({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [recent, setRecent] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => setRecent(load()), []);
  useEffect(() => {
    if (!initial) return;
    const next = [initial, ...load().filter((s) => s !== initial)].slice(0, MAX);
    save(next);
    setRecent(next);
  }, [initial]);

  const go = (term: string) => {
    const t = term.trim();
    if (t) router.push(`/search?q=${encodeURIComponent(t)}`);
  };
  const remove = (term: string) => {
    const next = recent.filter((s) => s !== term);
    save(next);
    setRecent(next);
  };

  return (
    <>
      <form role="search" className="search-form" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <input
          type="search" name="q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={50}
          placeholder="공연, 배우, 극장 검색" aria-label="검색어" autoFocus={!initial} enterKeyHint="search"
        />
        <button className="btn btn-primary">검색</button>
      </form>
      {!initial && <a href="/glossary" className="link glossary-link">모르는 말이 있나요? 막간 용어 사전 →</a>}
      {!initial && recent.length > 0 && (
        <section className="recent" aria-labelledby="recent-title">
          <h2 className="section-title" id="recent-title">최근 검색어</h2>
          <ul className="recent-list">
            {recent.map((s) => (
              <li key={s}>
                <button type="button" className="chip" onClick={() => go(s)}>{s}</button>
                <button type="button" className="recent-remove" aria-label={`${s} 지우기`} onClick={() => remove(s)}>×</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
