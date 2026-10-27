"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import AcademyCard from "@/components/AcademyCard";
import AcademyMap from "@/components/AcademyMap";
import Chip from "@/components/Chip";
import HomeLanding from "@/components/HomeLanding";
import SearchBox from "@/components/SearchBox";
import {
  EMPTY_FILTERS,
  TIME_BANDS,
  TUITION_BANDS,
  activeFilterCount,
  applyFilters,
  guOf,
  filtersFromParams,
  filtersToParams,
  toggle,
  type Filters,
} from "@/lib/filters";
import { AREAS, CATEGORIES, CATEGORY_LABEL, GRADES, GRADE_LABEL, SEOUL_GUS, WEEKDAYS, type Academy } from "@/lib/types";
import { useFavorites } from "@/lib/useStoredIds";

export default function HomeView({ academies }: { academies: Academy[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);
  const view = params.get("v") === "map" ? "map" : "list";
  const selectedId = params.get("sel");
  const [panelOpen, setPanelOpen] = useState(false);
  const fav = useFavorites();

  const replace = (next: URLSearchParams) => {
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  // 결과 화면 안에서 조건을 모두 풀어도 시작 화면으로 튕기지 않게 all=1을 붙인다
  const setFilters = (f: Filters) => {
    const p = filtersToParams(f, new URLSearchParams(params.toString()));
    p.set("all", "1");
    replace(p);
  };
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    replace(p);
  };

  const { academies: results, unknown } = applyFilters(academies, filters, fav.ids);
  // 데이터에 있는 구만 칩으로 보여 준다
  const gusInData = useMemo(() => SEOUL_GUS.filter((g) => academies.some((a) => guOf(a.address) === g)), [academies]);
  const extraCount = activeFilterCount(filters) - filters.categories.length;
  const selected = results.find((a) => a.id === selectedId) ?? null;

  // 결과 위에 보여 줄 고른 조건 (누르면 하나씩 뺀다)
  const conditions = [
    ...(filters.q ? [{ label: `‘${filters.q}’`, remove: () => setFilters({ ...filters, q: "" }) }] : []),
    ...filters.categories.map((c) => ({ label: CATEGORY_LABEL[c], remove: () => setFilters({ ...filters, categories: toggle(filters.categories, c) }) })),
    ...filters.grades.map((g) => ({ label: GRADE_LABEL[g], remove: () => setFilters({ ...filters, grades: toggle(filters.grades, g) }) })),
    ...filters.gus.map((g) => ({ label: g, remove: () => setFilters({ ...filters, gus: toggle(filters.gus, g) }) })),
    ...filters.areas.map((a) => ({ label: `${a}동`, remove: () => setFilters({ ...filters, areas: toggle(filters.areas, a) }) })),
    ...(filters.tuition ? [{ label: TUITION_BANDS.find((b) => b.id === filters.tuition)!.label, remove: () => setFilters({ ...filters, tuition: null }) }] : []),
    ...filters.days.map((d) => ({ label: `${d}요일`, remove: () => setFilters({ ...filters, days: toggle(filters.days, d) }) })),
    ...filters.times.map((t) => ({ label: TIME_BANDS.find((b) => b.id === t)!.label, remove: () => setFilters({ ...filters, times: toggle(filters.times, t) }) })),
    ...(filters.favoritesOnly ? [{ label: "♥ 즐겨찾기", remove: () => setFilters({ ...filters, favoritesOnly: false }) }] : []),
  ];

  // 조건을 하나도 고르지 않았으면 목록 대신 시작 화면 (all=1: 조건 없이 전체 결과)
  const showResults = activeFilterCount(filters) > 0 || !!filters.q || params.has("all") || params.has("v") || params.has("sel");
  if (!showResults) {
    return (
      <HomeLanding
        academies={academies}
        favoriteIds={fav.ids}
        onApply={(f, v) => {
          const p = filtersToParams(f);
          p.set("all", "1");
          if (v) p.set("v", v);
          router.push(`${pathname}?${p.toString()}`, { scroll: true });
        }}
      />
    );
  }

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <h1 className="sr-only">학원 찾기 결과</h1>
        <header className="flex items-center gap-1 pt-2.5 pr-4 pl-1.5">
          <button
            type="button"
            aria-label="처음 화면으로"
            onClick={() => router.push(pathname, { scroll: true })}
            className="grid size-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-ink active:bg-surface"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <SearchBox key={filters.q} initial={filters.q} onSubmit={(q) => setFilters({ ...filters, q })} variant="compact" />
          </div>
        </header>

        <div className="flex items-center gap-1.5 py-2.5 pr-4">
          {/* 분야 칩은 가로로 넘기고, 필터 버튼은 항상 보이게 오른쪽에 고정 */}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pl-4 [scrollbar-width:none]" role="group" aria-label="분야">
            {[...filters.categories, ...CATEGORIES.filter((c) => !filters.categories.includes(c) && academies.some((a) => a.categories.includes(c)))].map((c) => (
              <Chip key={c} selected={filters.categories.includes(c)} onClick={() => setFilters({ ...filters, categories: toggle(filters.categories, c) })}>
                {CATEGORY_LABEL[c]}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="filter-panel"
            onClick={() => setPanelOpen((o) => !o)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${extraCount ? "border-brand text-brand" : "border-line"}`}
          >
            필터{extraCount ? ` ${extraCount}` : ""} {panelOpen ? "▴" : "▾"}
          </button>
        </div>

        {panelOpen && (
          <div id="filter-panel" className="max-h-[55vh] space-y-3 overflow-y-auto border-t border-line px-4 py-3">
            <FilterGroup label="구">
              {gusInData.map((g) => (
                <Chip key={g} selected={filters.gus.includes(g)} onClick={() => setFilters({ ...filters, gus: toggle(filters.gus, g) })}>
                  {g}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="강서구 동네">
              {AREAS.map((a) => (
                <Chip key={a} selected={filters.areas.includes(a)} onClick={() => setFilters({ ...filters, areas: toggle(filters.areas, a) })}>
                  {a}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="대상 학년">
              {GRADES.map((g) => (
                <Chip key={g} selected={filters.grades.includes(g)} onClick={() => setFilters({ ...filters, grades: toggle(filters.grades, g) })}>
                  {GRADE_LABEL[g]}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="월 수강료">
              {TUITION_BANDS.map((b) => (
                <Chip key={b.id} selected={filters.tuition === b.id} onClick={() => setFilters({ ...filters, tuition: filters.tuition === b.id ? null : b.id })}>
                  {b.label}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="요일">
              {WEEKDAYS.map((d) => (
                <Chip key={d} selected={filters.days.includes(d)} onClick={() => setFilters({ ...filters, days: toggle(filters.days, d) })}>
                  {d}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="시간대 (수업 시작)">
              {TIME_BANDS.map((b) => (
                <Chip key={b.id} selected={filters.times.includes(b.id)} onClick={() => setFilters({ ...filters, times: toggle(filters.times, b.id) })}>
                  {b.label}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="기타">
              <Chip selected={filters.favoritesOnly} onClick={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}>
                ♥ 즐겨찾기만
              </Chip>
            </FilterGroup>
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-sm text-sub underline">
              필터 초기화
            </button>
          </div>
        )}
      </div>

      <main className="px-4 pt-3 pb-6">
        {academies.some((a) => a.name.startsWith("(예시)")) && (
          <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
            지금 보이는 학원·강사는 모두 <strong>가상의 예시 데이터</strong>입니다. 실제 학원이 아닙니다.
          </p>
        )}
        {academies.length > 0 && academies.every((a) => a.verification_status === "미확인") && !academies.some((a) => a.name.startsWith("(예시)")) && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-warn">
            지금은 공개 자료로 찾은 학원을 <strong>확인하는 중</strong>입니다. 수강료·시간·대상 학년은 학원에 직접 확인해 주세요.
          </p>
        )}
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm" aria-live="polite">
            <strong>{results.length}곳</strong>
            {unknown.tuition > 0 && <span className="text-sub"> · 수강료 미확인 {unknown.tuition}곳 제외</span>}
            {unknown.schedule > 0 && <span className="text-sub"> · 시간 미확인 {unknown.schedule}곳 제외</span>}
          </p>
          <div role="group" aria-label="보기 방식" className="flex shrink-0 rounded-full bg-surface p-0.5 text-sm">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setParam("v", v === "map" ? "map" : null)}
                className={`rounded-full px-3 py-1 whitespace-nowrap ${view === v ? "bg-white font-semibold text-brand shadow-sm" : "text-sub"}`}
              >
                {v === "list" ? "목록" : "지도"}
              </button>
            ))}
          </div>
        </div>

        {conditions.length > 0 && (
          <ul aria-label="고른 조건" className="mb-3 flex flex-wrap gap-1.5">
            {conditions.map((c) => (
              <li key={c.label}>
                <button
                  type="button"
                  aria-label={`${c.label} 조건 빼기`}
                  onClick={c.remove}
                  className="rounded-full bg-brand-soft py-1 pr-2 pl-3 text-sm text-brand active:bg-line"
                >
                  {c.label} <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {view === "map" ? (
          <div className="space-y-3">
            <AcademyMap academies={results} selectedId={selected?.id ?? null} onSelect={(id) => setParam("sel", id)} />
            {selected ? <AcademyCard academy={selected} /> : <p className="text-sm text-sub">지도의 표시를 누르면 학원 정보가 나옵니다.</p>}
          </div>
        ) : (
          <ul className="space-y-3">
            {results.map((a) => (
              <li key={a.id}>
                <AcademyCard academy={a} />
              </li>
            ))}
          </ul>
        )}
        {results.length === 0 && (
          <div className="py-10 text-center text-sub">
            <p>조건에 맞는 학원이 없습니다.</p>
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="mt-2 text-sm text-brand underline">
              필터 초기화
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-sub">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
