import Link from "next/link";
import { deadlineLevel, formatDeadline, formatOpen } from "@/lib/date";
import { BENEFIT_TYPE_LABEL, type Benefit } from "@/lib/data/benefits";

/** 혜택 카드. 마감 배지 3단계: 오늘(주황) / 3일 이내 / 일반, 지난 건 회색(SPEC-2 A-1) */
export default function BenefitCard({ benefit, now = new Date() }: { benefit: Benefit; now?: Date }) {
  const b = benefit;
  const level = b.ends_at ? deadlineLevel(b.ends_at, now) : null;
  const opensLater = b.type === "ticket_open" && b.starts_at && new Date(b.starts_at) > now;

  return (
    <article className="benefit-card" data-level={level ?? "none"}>
      <div className="benefit-top">
        <span className={`benefit-type type-${b.type}`}>{BENEFIT_TYPE_LABEL[b.type]}</span>
        {opensLater ? (
          <span className="deadline deadline-open">{formatOpen(b.starts_at!, now)}</span>
        ) : b.ends_at ? (
          <span className={`deadline deadline-${level}`}>{formatDeadline(b.ends_at, now)}</span>
        ) : null}
      </div>
      <strong className="benefit-title">{b.title}</strong>
      {b.show && <Link href={`/shows/${b.show.id}`} className="benefit-show">{b.show.title}</Link>}
      {b.note && <p className="benefit-note">{b.note}</p>}
      {(b.source_name || b.source_url) && (
        <p className="benefit-source">
          출처{" "}
          {b.source_url ? (
            <a href={b.source_url} target="_blank" rel="noopener noreferrer nofollow">{b.source_name ?? "바로가기"} ↗</a>
          ) : b.source_name}
        </p>
      )}
    </article>
  );
}
