"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import AcademyCard from "@/components/AcademyCard";
import AcademyMap from "@/components/AcademyMap";
import Chip from "@/components/Chip";
import {
  EMPTY_FILTERS,
  TIME_BANDS,
  TUITION_BANDS,
  activeFilterCount,
  applyFilters,
  filtersFromParams,
  filtersToParams,
  toggle,
  type Filters,
} from "@/lib/filters";
import { CATEGORIES, CATEGORY_LABEL, GRADES, GRADE_LABEL, WEEKDAYS, type Academy } from "@/lib/types";
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
  const setFilters = (f: Filters) => replace(filtersToParams(f, new URLSearchParams(params.toString())));
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    replace(p);
  };

  const { academies: results, unknown } = applyFilters(academies, filters, fav.ids);
  const extraCount = activeFilterCount(filters) - filters.categories.length;
  const selected = results.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <header className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">마곡 뮤지컬 학원 찾기</h1>
            <p className="text-xs text-sub">초·중등 보컬 · 댄스 · 발레 · 연기 · 뮤지컬 종합</p>
          </div>
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
        </header>

        <div className="flex items-center gap-1.5 py-2.5 pr-4">
          {/* 분야 칩은 가로로 넘기고, 필터 버튼은 항상 보이게 오른쪽에 고정 */}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pl-4 [scrollbar-width:none]" role="group" aria-label="분야">
            {CATEGORIES.map((c) => (
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
        <p className="mb-2 text-sm" aria-live="polite">
          <strong>{results.length}곳</strong>
          {unknown.tuition > 0 && <span className="text-sub"> · 수강료 미확인 {unknown.tuition}곳 제외</span>}
          {unknown.schedule > 0 && <span className="text-sub"> · 시간 미확인 {unknown.schedule}곳 제외</span>}
        </p>

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
