import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import BenefitCard from "@/components/BenefitCard";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { BENEFIT_TYPES, BENEFIT_TYPE_LABEL, listBenefits, type Benefit, type BenefitType } from "@/lib/data/benefits";

export const metadata = { title: "혜택 · 막간" };

type Query = { type?: string; when?: string; expired?: string };

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams;
  const type = BENEFIT_TYPES.includes(sp.type as BenefitType) ? (sp.type as BenefitType) : undefined;
  const endingToday = sp.when === "today";
  const includeExpired = sp.expired === "1" && !endingToday;

  const href = (patch: Partial<Record<keyof Query, string | undefined>>) => {
    const q = new URLSearchParams();
    const next = { type, when: endingToday ? "today" : undefined, expired: includeExpired ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/benefits?${s}` : "/benefits";
  };

  let items: Benefit[] | null;
  try {
    items = await listBenefits({ type, includeExpired, endingToday });
  } catch {
    items = null;
  }
  const now = new Date();

  return (
    <>
      <PageHeader title="혜택" />
      <main className="page-body">
        <nav className="chips" aria-label="혜택 종류">
          <Link href={href({ type: undefined, when: undefined })} className="chip" aria-current={!type && !endingToday ? "true" : undefined}>전체</Link>
          <Link href={href({ type: undefined, when: "today", expired: undefined })} className="chip chip-today" aria-current={endingToday && !type ? "true" : undefined}>오늘 마감</Link>
          {BENEFIT_TYPES.map((t) => (
            <Link key={t} href={href({ type: t, when: undefined })} className="chip" aria-current={type === t ? "true" : undefined}>{BENEFIT_TYPE_LABEL[t]}</Link>
          ))}
        </nav>
        {!endingToday && (
          <p className="filter-note">
            {includeExpired ? "마감 지난 혜택도 보고 있어요" : "마감 지난 혜택은 숨겼어요"}{" "}
            <Link href={href({ expired: includeExpired ? undefined : "1" })}>{includeExpired ? "숨기기" : "같이 보기"}</Link>
          </p>
        )}

        {items === null ? (
          <ErrorState retryHref={href({})} />
        ) : items.length === 0 ? (
          endingToday
            ? <EmptyState icon="⏰" message="오늘 마감되는 혜택은 없어요" action={{ label: "전체 혜택 보기", href: "/benefits" }} />
            : <EmptyState icon="🎁" message="지금 받을 수 있는 혜택이 없어요" action={type ? { label: "전체 혜택 보기", href: "/benefits" } : undefined} />
        ) : (
          <ul className="benefit-list">
            {items.map((b) => <li key={b.id}><BenefitCard benefit={b} now={now} /></li>)}
          </ul>
        )}
      </main>
    </>
  );
}
