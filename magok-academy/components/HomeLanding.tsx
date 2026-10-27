"use client";

// 첫 화면: 목록을 바로 늘어놓지 않고, 검색 → 분야·학년·지역 고르기(개수 미리보기) → 결과 순서로 안내한다.

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchBox from "@/components/SearchBox";
import StatusBadge from "@/components/StatusBadge";
import { EMPTY_FILTERS, applyFilters, guOf, toggle, type Filters } from "@/lib/filters";
import { CATEGORIES, CATEGORY_LABEL, GRADES, GRADE_LABEL, SEOUL_GUS, type Academy, type Category, type Grade, type Gu } from "@/lib/types";

const CATEGORY_ICON: Record<Category, string> = {
  보컬: "🎤",
  댄스: "💃",
  발레: "🩰",
  탭댄스: "👞",
  아크로바틱: "🤸",
  체조: "🎀",
  연기: "🎭",
  뮤지컬종합: "🎵",
};

const GRADE_SHORT: Record<Grade, string> = { 초저: "초등 1~3", 초고: "초등 4~6", 중등: "중학생" };

export default function HomeLanding({
  academies,
  favoriteIds,
  onApply,
}: {
  academies: Academy[];
  favoriteIds: readonly string[];
  /** 결과 화면으로: 고른 조건과 보기 방식 */
  onApply: (f: Filters, view?: "map") => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gu, setGu] = useState<Gu | null>(null);

  const draft: Filters = { ...EMPTY_FILTERS, categories, grades, gus: gu ? [gu] : [] };
  const count = applyFilters(academies, draft).academies.length;
  const picked = categories.length + grades.length + (gu ? 1 : 0);

  const catCount = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c, academies.filter((a) => a.categories.includes(c)).length])), [academies]);
  // 데이터에 없는 분야는 타일을 만들지 않는다
  const cats = CATEGORIES.filter((c) => catCount[c] > 0);
  const gus = useMemo(
    () =>
      SEOUL_GUS.map((g) => ({ g, n: academies.filter((a) => guOf(a.address) === g).length }))
        .filter((x) => x.n > 0)
        .sort((x, y) => y.n - x.n),
    [academies],
  );
  const recent = useMemo(
    () =>
      academies
        .filter((a) => a.verification_status === "확인됨" && !a.name.startsWith("(예시)"))
        .sort((x, y) => (y.last_verified_at ?? "").localeCompare(x.last_verified_at ?? "") || x.id.localeCompare(y.id))
        .slice(0, 10),
    [academies],
  );
  const favorites = academies.filter((a) => favoriteIds.includes(a.id));
  const isSample = academies.some((a) => a.name.startsWith("(예시)"));

  return (
    <main className="pb-8">
      <section className="bg-gradient-to-br from-brand to-violet-500 px-4 pt-6 pb-10 text-white">
        <p className="text-xs font-medium opacity-80">서울 · 초·중등 예체능 학원</p>
        <h1 className="mt-1 text-[1.6rem] leading-snug font-bold">
          우리 아이에게 맞는
          <br />
          노래·춤·연기 학원 찾기
        </h1>
        <p className="mt-1.5 text-sm opacity-90">학원 {academies.length}곳 · 모든 정보에 출처와 확인일 표시</p>
        <div className="mt-4">
          <SearchBox initial="" onSubmit={(q) => onApply({ ...EMPTY_FILTERS, q })} variant="hero" />
        </div>
      </section>

      <section aria-labelledby="finder-title" className="relative -mt-5 rounded-t-3xl bg-white px-4 pt-5">
        {isSample && (
          <p className="mb-4 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
            지금 보이는 학원·강사는 모두 <strong>가상의 예시 데이터</strong>입니다. 실제 학원이 아닙니다.
          </p>
        )}
        <h2 id="finder-title" className="text-base font-bold">
          무엇을 배우고 싶나요?
        </h2>
        <p className="text-xs text-sub">여러 개 골라도 돼요</p>
        <div role="group" aria-label="분야 고르기" className={`mt-3 grid gap-2 ${cats.length > 6 ? "grid-cols-4" : "grid-cols-3"}`}>
          {cats.map((c) => {
            const on = categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                aria-label={`${CATEGORY_LABEL[c]} ${catCount[c]}곳`}
                onClick={() => setCategories(toggle(categories, c))}
                className={`flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2.5 transition-colors ${
                  on ? "border-brand bg-brand-soft" : "border-line bg-white active:bg-surface"
                }`}
              >
                <span aria-hidden className="text-2xl leading-none">
                  {CATEGORY_ICON[c]}
                </span>
                <span className={`text-[13px] whitespace-nowrap ${on ? "font-semibold text-brand" : ""}`}>{CATEGORY_LABEL[c]}</span>
                <span className="text-[11px] text-sub">{catCount[c]}곳</span>
              </button>
            );
          })}
        </div>

        <h2 className="mt-5 text-base font-bold">아이 학년은요?</h2>
        <div role="group" aria-label="학년 고르기" className="mt-2 grid grid-cols-3 gap-2">
          {GRADES.map((g) => {
            const on = grades.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => setGrades(toggle(grades, g))}
                className={`rounded-xl border px-2 py-2.5 text-sm ${on ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line active:bg-surface"}`}
              >
                {GRADE_SHORT[g]}
              </button>
            );
          })}
        </div>

        <h2 className="mt-5 text-base font-bold">어디에서 다닐까요?</h2>
        <div role="group" aria-label="지역 고르기" className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <RegionChip on={gu === null} onClick={() => setGu(null)}>
            서울 전체
          </RegionChip>
          {gus.map(({ g, n }) => (
            <RegionChip key={g} on={gu === g} onClick={() => setGu(gu === g ? null : g)}>
              {g} <span className={gu === g ? "opacity-80" : "text-sub"}>{n}</span>
            </RegionChip>
          ))}
        </div>

        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 mt-5 bg-white/95 pt-1 pb-2 backdrop-blur">
          <button
            type="button"
            disabled={count === 0}
            onClick={() => onApply(draft)}
            className="w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/20 disabled:bg-line disabled:text-sub disabled:shadow-none"
          >
            {count === 0 ? "조건에 맞는 학원이 없어요" : picked ? `조건에 맞는 학원 ${count}곳 보기` : `학원 ${count}곳 모두 보기`}
          </button>
          <div className="mt-2 flex justify-center gap-4 text-sm">
            {picked > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCategories([]);
                  setGrades([]);
                  setGu(null);
                }}
                className="text-sub underline underline-offset-2"
              >
                다시 고르기
              </button>
            )}
            <button type="button" onClick={() => onApply(draft, "map")} className="font-medium text-brand">
              지도로 보기 →
            </button>
          </div>
        </div>
      </section>

      {favorites.length > 0 && (
        <Shelf title="♥ 즐겨찾기한 학원" items={favorites} />
      )}
      {recent.length > 0 && <Shelf title="최근 확인한 학원" note="교육청 등록 정보를 확인한 곳" items={recent} />}

      <section className="mt-7 px-4">
        <h2 className="text-base font-bold">지역별로 둘러보기</h2>
        <p className="text-xs text-sub">구를 누르면 그 지역 학원만 보여 드려요</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gus.map(({ g, n }) => (
            <button
              key={g}
              type="button"
              onClick={() => onApply({ ...EMPTY_FILTERS, gus: [g] })}
              className="rounded-full bg-surface px-3 py-1.5 text-sm active:bg-line"
            >
              {g} <span className="text-sub">{n}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-4 mt-7 rounded-2xl border border-line p-4">
        <h2 className="text-sm font-bold">믿고 볼 수 있게</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-sub">
          <li>✔ 교육청 등록 정보·학원이 직접 공개한 정보만 싣습니다</li>
          <li>✔ 강사 경력마다 출처 링크와 수집일을 붙입니다</li>
          <li>✔ 틀린 정보는 학원 화면에서 바로 정정 요청할 수 있어요</li>
        </ul>
        <Link href="/about/" className="mt-3 inline-block text-sm font-medium text-brand">
          수집 기준 자세히 보기 →
        </Link>
      </section>
    </main>
  );
}

function RegionChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${on ? "border-brand bg-brand text-white" : "border-line bg-white"}`}
    >
      {children}
    </button>
  );
}

function Shelf({ title, note, items }: { title: string; note?: string; items: Academy[] }) {
  return (
    <section className="mt-7" aria-label={title}>
      <div className="flex items-baseline gap-2 px-4">
        <h2 className="text-base font-bold">{title}</h2>
        {note && <span className="text-xs text-sub">{note}</span>}
      </div>
      <ul className="mt-2 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {items.map((a) => (
          <li key={a.id} className="w-[13.5rem] shrink-0 snap-start">
            <Link href={`/academy/${a.id}/`} className="flex h-full flex-col rounded-2xl border border-line bg-white p-3 active:bg-surface">
              <div className="flex flex-wrap gap-1">
                {a.categories.slice(0, 3).map((c) => (
                  <span key={c} className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">
                    {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
                  </span>
                ))}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm leading-snug font-semibold">{a.name}</h3>
              <p className="mt-auto pt-2 text-xs text-sub">
                {[guOf(a.address), a.address?.match(/\((\S+?동)/)?.[1]].filter(Boolean).join(" ") || "주소 미확인"}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="text-[11px] text-sub">{a.target_grades.map((g) => GRADE_SHORT[g]).join(" · ") || "학년 미확인"}</span>
                <StatusBadge status={a.verification_status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
