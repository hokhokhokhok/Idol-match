import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ScoreBars from "@/components/ScoreBars";
import SeatReviewItem from "@/components/SeatReviewItem";
import EmptyState from "@/components/EmptyState";
import { getZone, listZoneReviews } from "@/lib/data/seat-reviews";
import { ROW_BAND_LABEL, rowBand, type RowBand } from "@/lib/seat";

export const metadata = { title: "구역 좌석 후기 · 막간" };

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export default async function ZonePage({ params, searchParams }: { params: Promise<{ id: string; zoneId: string }>; searchParams: Promise<{ row?: string; obstructed?: string }> }) {
  const { id, zoneId } = await params;
  const sp = await searchParams;
  const zone = await getZone(id, zoneId);
  if (!zone) notFound();
  const all = await listZoneReviews(zoneId);

  const band = (["front", "middle", "back"] as const).includes(sp.row as RowBand) ? (sp.row as RowBand) : undefined;
  const obstructed = sp.obstructed === "yes" ? true : sp.obstructed === "no" ? false : undefined;
  const reviews = all.filter((r) => (!band || rowBand(r.seat_row) === band) && (obstructed === undefined || r.is_obstructed === obstructed));
  const base = `/theaters/${id}/zones/${zoneId}`;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { row: band, obstructed: sp.obstructed === "yes" || sp.obstructed === "no" ? sp.obstructed : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.toString() ? `${base}?${p}` : base;
  };

  return (
    <>
      <PageHeader title={`${zone.floor} ${zone.name}`} back={`/theaters/${id}?floor=${encodeURIComponent(zone.floor)}`} />
      <main className="page-body">
        <p className="lead">{zone.theater.name}</p>
        <ScoreBars view={avg(all.map((r) => r.view_score))} distance={avg(all.map((r) => r.distance_score))} sound={avg(all.map((r) => r.sound_score))} />
        <p className="muted zone-total">좌석 후기 {all.length}개</p>
        {all.length > 0 && all.length < 3 && <p className="notice">후기가 적어 참고용이에요</p>}

        <nav className="chips" aria-label="열 범위">
          <Link href={href({ row: undefined })} className="chip" aria-current={!band ? "true" : undefined}>전체 열</Link>
          {(["front", "middle", "back"] as const).map((b) => (
            <Link key={b} href={href({ row: b })} className="chip" aria-current={band === b ? "true" : undefined}>{ROW_BAND_LABEL[b]}</Link>
          ))}
        </nav>
        <nav className="chips" aria-label="시야 방해">
          <Link href={href({ obstructed: undefined })} className="chip" aria-current={obstructed === undefined ? "true" : undefined}>시야 방해 전체</Link>
          <Link href={href({ obstructed: "no" })} className="chip" aria-current={obstructed === false ? "true" : undefined}>방해 없음</Link>
          <Link href={href({ obstructed: "yes" })} className="chip" aria-current={obstructed === true ? "true" : undefined}>방해 있음</Link>
        </nav>

        {all.length === 0 ? (
          <EmptyState icon="💺" message="이 구역의 첫 좌석 후기를 남겨볼까요?" action={{ label: "좌석 후기 쓰기", href: `/theaters/${id}/seat-reviews/new?zone=${zoneId}` }} />
        ) : reviews.length === 0 ? (
          <p className="muted">조건에 맞는 후기가 없어요</p>
        ) : (
          <ul className="review-list">
            {reviews.map((r) => <li key={r.id}><SeatReviewItem r={r} zoneName={zone.name} /></li>)}
          </ul>
        )}
        {all.length > 0 && <Link href={`/theaters/${id}/seat-reviews/new?zone=${zoneId}`} className="btn btn-primary btn-block seat-write">+ 좌석 후기 쓰기</Link>}
      </main>
    </>
  );
}
