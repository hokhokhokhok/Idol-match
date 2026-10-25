import { formatYears } from "@/lib/format";
import { CAREER_TYPES, CAREER_TYPE_LABEL, type CareerItem, type PersonWithCareer } from "@/lib/types";

export default function PersonCard({ person: p }: { person: PersonWithCareer }) {
  return (
    <article className="rounded-xl border border-line p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{p.name_public}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.role === "원장" ? "bg-ink text-white" : "bg-surface text-sub"}`}>
          {p.role}
        </span>
      </header>
      <p className="mt-0.5 text-sm text-sub">담당: {p.subjects.length ? p.subjects.join(", ") : "미확인"}</p>

      {p.careers.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-sub">공개된 경력 정보가 없습니다.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {CAREER_TYPES.map((type) => {
            const items = p.careers.filter((c) => c.type === type);
            if (!items.length) return null;
            return (
              <section key={type}>
                <h4 className="mb-1 text-xs font-semibold text-sub">{CAREER_TYPE_LABEL[type]}</h4>
                <ul className="space-y-2">
                  {items.map((c) => (
                    <CareerRow key={c.id} career={c} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <footer className="mt-3 border-t border-line pt-2 text-xs text-sub">
        공개 근거: {p.disclosure_basis} · 수집 {p.collected_at}
        {p.profile_source_url && (
          <>
            {" · "}
            <a href={p.profile_source_url} target="_blank" rel="noopener noreferrer" className="underline">
              프로필 출처
            </a>
          </>
        )}
      </footer>
    </article>
  );
}

function CareerRow({ career: c }: { career: CareerItem }) {
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-medium">{c.title}</span>
        <span className="text-sub">{formatYears(c)}</span>
        {c.type === "musical_performance" &&
          (c.verified ? (
            <span className="rounded bg-emerald-50 px-1.5 text-xs text-ok" title="공연 DB(KOPIS 등)로 작품·연도 교차 확인">
              공연 DB 확인
            </span>
          ) : (
            <span className="rounded bg-amber-50 px-1.5 text-xs text-warn" title="본인·학원 공개 정보, 공연 DB 교차 확인 전">
              미확인
            </span>
          ))}
      </div>
      {c.organization && <div className="text-sub">{c.organization}</div>}
      <div className="text-xs text-sub">
        출처:{" "}
        <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">
          {c.source_type}
        </a>{" "}
        · 수집 {c.collected_at}
      </div>
    </li>
  );
}
