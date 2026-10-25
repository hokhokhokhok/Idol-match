import Link from "next/link";
import Poster from "./Poster";
import WishButton from "./WishButton";
import { formatPeriod, showStatus } from "@/lib/date";
import type { ShowSummary } from "@/lib/types";

const STATUS_LABEL = { upcoming: "공연 예정", running: "공연 중", ended: "공연 종료" } as const;

/** 가로형 공연 카드(목록): 포스터 + 제목 + 극장 + 기간 + ♡. wished를 안 주면 ♡를 숨긴다. */
export default function ShowCard({ show, note, wished }: { show: ShowSummary; note?: string; wished?: boolean }) {
  const status = showStatus(show.starts_on, show.ends_on);
  return (
    <div className="show-card">
      <Link href={`/shows/${show.id}`} className="show-card-link">
        <Poster src={show.poster_url} alt={show.title} className="show-card-poster" />
        <div className="show-card-body">
          <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
          <strong className="show-card-title">{show.title}</strong>
          {show.theater && <span className="show-card-sub">{show.theater.name}</span>}
          <span className="show-card-sub">{formatPeriod(show.starts_on, show.ends_on)}</span>
          {note && <span className="show-card-note">{note}</span>}
        </div>
      </Link>
      {wished !== undefined && <WishButton showId={show.id} title={show.title} wished={wished} />}
    </div>
  );
}
