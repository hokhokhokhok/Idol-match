import Link from "next/link";
import { CompareButton, FavoriteButton } from "@/components/ActionButtons";
import StatusBadge from "@/components/StatusBadge";
import { formatTuitionRange } from "@/lib/format";
import { CATEGORY_LABEL, GRADE_LABEL, type Academy } from "@/lib/types";

export default function AcademyCard({ academy: a }: { academy: Academy }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/academy/${a.id}/`} className="min-w-0 flex-1">
          <h2 className="font-semibold underline-offset-2 hover:underline">{a.name}</h2>
          <p className="mt-0.5 text-sm text-sub">{a.address ?? "주소 미확인"}</p>
        </Link>
        <StatusBadge status={a.verification_status} />
      </div>
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
      <dl className="mt-2 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-sm">
        <dt className="text-sub">수강료</dt>
        <dd>{formatTuitionRange(a) ?? a.tuition_note ?? "미확인"}</dd>
        <dt className="text-sub">시간</dt>
        <dd>{a.schedule_note ?? "미확인"}</dd>
      </dl>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Link href={`/academy/${a.id}/`} className="mr-auto text-sm font-medium text-brand">
          상세·강사 경력 →
        </Link>
        <FavoriteButton id={a.id} name={a.name} />
        <CompareButton id={a.id} name={a.name} />
      </div>
    </article>
  );
}
