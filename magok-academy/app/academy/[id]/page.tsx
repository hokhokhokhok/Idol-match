import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompareButton, FavoriteButton } from "@/components/ActionButtons";
import PersonCard from "@/components/PersonCard";
import StaleNote from "@/components/StaleNote";
import StatusBadge from "@/components/StatusBadge";
import { correctionLink } from "@/lib/constants";
import { formatTuitionRange, isSample, sourceLabel } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import { CATEGORY_LABEL, GRADE_LABEL } from "@/lib/types";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getRepository().listAcademies()).map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await getRepository().getAcademy((await params).id);
  return { title: a ? `${a.name} · 서울 뮤지컬 학원 찾기` : "학원 없음" };
}

export default async function AcademyPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await getRepository().getAcademy((await params).id);
  if (!a) notFound();
  const range = formatTuitionRange(a);

  const links = [
    { label: "홈페이지", href: a.website },
    { label: "인스타그램", href: a.instagram },
    { label: "네이버 플레이스", href: a.naver_place_url },
  ].filter((l): l is { label: string; href: string } => !!l.href);

  return (
    <main className="pb-6">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-white/95 px-2 py-2 backdrop-blur">
        <Link href="/" className="rounded-full px-2 py-1 text-lg" aria-label="목록으로">
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{a.name}</h1>
        <FavoriteButton id={a.id} name={a.name} />
        <CompareButton id={a.id} name={a.name} />
      </div>

      <div className="space-y-6 px-4 pt-4">
        {isSample(a.name) && (
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">가상의 예시 데이터입니다. 실제 학원이 아닙니다.</p>
        )}

        {/* 1. 요약 */}
        <section aria-labelledby="sum" className="rounded-xl border border-line p-4">
          <h2 id="sum" className="sr-only">요약</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={a.verification_status} />
            <StaleNote lastVerified={a.last_verified_at} />
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
          {a.description && <p className="mt-3 text-sm">{a.description}</p>}
          <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 text-sm">
            <dt className="text-sub">주소</dt>
            <dd>
              {a.address ?? "미확인"}
              {a.lat !== null && (
                <Link href={`/?v=map&sel=${a.id}`} className="ml-1.5 text-brand underline">
                  지도
                </Link>
              )}
            </dd>
            <dt className="text-sub">전화</dt>
            <dd>{a.phone ? <a href={`tel:${a.phone}`} className="underline">{a.phone}</a> : "미확인"}</dd>
            <dt className="text-sub">수강료</dt>
            <dd>
              {a.tuition_note ?? "미확인"}
              {range && a.tuition_note && <span className="block text-xs text-sub">필터 기준: {range}</span>}
            </dd>
            <dt className="text-sub">개원</dt>
            <dd>{a.opened_year ? `${a.opened_year}년` : "미확인"}</dd>
          </dl>
          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-3 py-1 text-sm">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}
        </section>

        {/* 2. 원장·강사 */}
        <section aria-labelledby="people">
          <h2 id="people" className="mb-2 text-base font-bold">
            원장·강사 <span className="text-sm font-normal text-sub">{a.people.length}명</span>
          </h2>
          {a.people.length === 0 ? (
            <p className="rounded-lg bg-surface px-3 py-2 text-sm text-sub">공개된 원장·강사 정보가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {a.people.map((p) => (
                <PersonCard key={p.id} person={p} />
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-sub">
            본인·학원이 직접 공개한 정보만 싣습니다. &lsquo;공연 DB 확인&rsquo;은 KOPIS 등에서 작품·연도를 교차 확인한 뮤지컬 경력입니다.
          </p>
        </section>

        {/* 3. 수업·공연 이력 */}
        <section aria-labelledby="classes">
          <h2 id="classes" className="mb-2 text-base font-bold">수업·공연 이력</h2>
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 rounded-xl border border-line p-4 text-sm">
            <dt className="text-sub">수업 시간</dt>
            <dd>{a.schedule_note ?? "미확인"}</dd>
            <dt className="text-sub">수업 방식</dt>
            <dd>{a.class_style ?? "미확인"}</dd>
            <dt className="text-sub">발표회·공연</dt>
            <dd>{a.performance_history ?? "미확인"}</dd>
          </dl>
        </section>

        {/* 4. 출처·정정 요청 */}
        <section aria-labelledby="src" className="rounded-xl bg-surface p-4 text-sm">
          <h2 id="src" className="mb-1 font-bold">출처·정정 요청</h2>
          <p className="text-sub">
            확인 상태: {a.verification_status}
            {a.last_verified_at ? ` · 마지막 확인 ${a.last_verified_at}` : " · 확인일 없음"}
          </p>
          {a.source_urls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {a.source_urls.map((u) => (
                <li key={u} className="truncate">
                  학원 정보 출처:{" "}
                  <a href={u} target="_blank" rel="noopener noreferrer" className="underline">
                    {sourceLabel(u)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-sub">경력마다 출처 링크와 수집일을 함께 표시합니다. 확인되지 않은 항목은 &lsquo;미확인&rsquo;으로 둡니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={correctionLink(a)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
            >
              정보 정정·삭제 요청
            </a>
            <Link href="/about/" className="rounded-full border border-line bg-white px-4 py-2 text-sm">
              수집 기준 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
