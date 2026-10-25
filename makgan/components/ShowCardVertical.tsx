import Link from "next/link";
import Poster from "./Poster";
import WishButton from "./WishButton";
import { formatPeriod } from "@/lib/date";
import type { ShowSummary } from "@/lib/types";

/** 세로형 공연 카드(가로 스크롤용, SPEC-2 A-1) */
export default function ShowCardVertical({ show, wished }: { show: ShowSummary; wished?: boolean }) {
  return (
    <div className="vcard">
      <Link href={`/shows/${show.id}`} className="vcard-link">
        <Poster src={show.poster_url} alt={show.title} className="vcard-poster" />
        <strong className="vcard-title">{show.title}</strong>
        <span className="vcard-sub">{formatPeriod(show.starts_on, show.ends_on)}</span>
      </Link>
      {wished !== undefined && <div className="vcard-wish"><WishButton showId={show.id} title={show.title} wished={wished} /></div>}
    </div>
  );
}
