import StatusBadge from "@/components/StatusBadge";
import { getRepository, loadData } from "@/lib/repository";
import { CATEGORY_LABEL, GRADE_LABEL } from "@/lib/types";

// 1단계: CSV → 화면 연결 확인용 단순 목록. 필터·지도는 2·3단계에서.
export default async function Home() {
  const academies = await getRepository().listAcademies();
  const hasSample = academies.some((a) => a.name.startsWith("(예시)"));
  const errorCount = loadData().issues.filter((i) => i.level === "error").length;

  return (
    <main className="px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">마곡 뮤지컬 학원 찾기</h1>
        <p className="text-sm text-sub">초·중등 보컬 · 댄스 · 연기 · 뮤지컬 종합</p>
      </header>

      {hasSample && (
        <p className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          지금 보이는 학원·강사는 모두 <strong>가상의 예시 데이터</strong>입니다. 실제 학원이 아닙니다.
        </p>
      )}
      {errorCount > 0 && process.env.NODE_ENV !== "production" && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-warn">
          CSV 오류 {errorCount}건으로 일부 행이 제외됨 — <code>npm run check:data</code>로 확인
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {academies.map((a) => (
          <li key={a.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{a.name}</h2>
              <StatusBadge status={a.verification_status} />
            </div>
            <p className="mt-1 text-sm text-sub">{a.address ?? "주소 미확인"}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {a.categories.map((c) => (
                <span key={c} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                  {CATEGORY_LABEL[c]}
                </span>
              ))}
              {a.target_grades.map((g) => (
                <span key={g} className="rounded-full bg-surface px-2 py-0.5 text-xs text-sub">
                  {GRADE_LABEL[g]}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm">{a.tuition_note ?? "수강료 미확인"}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
