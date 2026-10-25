"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { describeSummary, summarizeCareers } from "@/lib/compare";
import { COMPARE_MAX } from "@/lib/constants";
import { formatTuitionRange } from "@/lib/format";
import { CATEGORY_LABEL, GRADE_LABEL, type AcademyDetail } from "@/lib/types";
import { useCompare } from "@/lib/useStoredIds";

type Row = { label: string; render: (a: AcademyDetail) => React.ReactNode };

const ROWS: Row[] = [
  { label: "확인 상태", render: (a) => <StatusBadge status={a.verification_status} /> },
  { label: "분야", render: (a) => a.categories.map((c) => CATEGORY_LABEL[c]).join(", ") },
  { label: "대상", render: (a) => (a.target_grades.length ? a.target_grades.map((g) => GRADE_LABEL[g]).join(", ") : "미확인") },
  {
    label: "수강료",
    render: (a) => (
      <>
        {formatTuitionRange(a) ?? "미확인"}
        {a.tuition_note && <span className="block text-xs text-sub">{a.tuition_note}</span>}
      </>
    ),
  },
  { label: "수업 시간", render: (a) => a.schedule_note ?? "미확인" },
  { label: "수업 방식", render: (a) => a.class_style ?? "미확인" },
  { label: "발표회·공연", render: (a) => a.performance_history ?? "미확인" },
  { label: "개원", render: (a) => (a.opened_year ? `${a.opened_year}년` : "미확인") },
  {
    label: "원장·강사 경력",
    render: (a) =>
      a.people.length ? (
        <ul className="space-y-1.5">
          {a.people.map((p) => (
            <li key={p.id}>
              <span className="font-medium">{p.name_public}</span>
              <span className="block text-xs text-sub">{describeSummary(summarizeCareers(p))}</span>
            </li>
          ))}
        </ul>
      ) : (
        "공개 정보 없음"
      ),
  },
];

export default function CompareView({ details }: { details: AcademyDetail[] }) {
  const cmp = useCompare();
  const selected = cmp.ids.map((id) => details.find((d) => d.id === id)).filter((d): d is AcademyDetail => !!d);

  return (
    <main className="px-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">
          학원 비교 <span className="text-sm font-normal text-sub">{selected.length}/{COMPARE_MAX}</span>
        </h1>
        {selected.length > 0 && (
          <button type="button" onClick={cmp.clear} className="text-sm text-sub underline">
            모두 빼기
          </button>
        )}
      </header>

      {selected.length < 2 && (
        <div className="mt-4 rounded-xl bg-surface p-4 text-sm">
          <p>
            비교할 학원을 {selected.length ? "1곳 더" : "2~3곳"} 담아 주세요. 목록이나 상세 화면의 <strong>비교 +</strong> 버튼으로 담을 수
            있습니다.
          </p>
          <Link href="/" className="mt-2 inline-block font-medium text-brand">
            학원 찾으러 가기 →
          </Link>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-4" style={{ ["--cols" as string]: selected.length }}>
          <div className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2">
            {selected.map((a) => (
              <div key={a.id} className="flex min-w-0 flex-col gap-1 rounded-lg bg-brand-soft p-2">
                <Link href={`/academy/${a.id}/`} className="text-sm font-semibold break-all text-brand">
                  {a.name}
                </Link>
                <button type="button" onClick={() => cmp.toggle(a.id)} className="self-start text-xs text-sub underline">
                  빼기
                </button>
              </div>
            ))}
          </div>
          {ROWS.map((row) => (
            <section key={row.label} className="mt-3">
              <h2 className="mb-1 text-xs font-semibold text-sub">{row.label}</h2>
              <div className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2 text-sm">
                {selected.map((a) => (
                  <div key={a.id} className="min-w-0 rounded-lg border border-line p-2 break-words">
                    {row.render(a)}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
