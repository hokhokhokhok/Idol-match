import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ErrorState from "@/components/ErrorState";
import { getTheater } from "@/lib/data/theaters";
import { listUnzonedReviews } from "@/lib/data/seat-reviews";
import SeatReviewItem from "@/components/SeatReviewItem";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTheater((await params).id).catch(() => null);
  return { title: t ? `${t.name} · 막간` : "극장 · 막간" };
}

export default async function TheaterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ floor?: string }> }) {
  const { id } = await params;
  let theater;
  try {
    theater = await getTheater(id);
  } catch {
    return (<><PageHeader title="극장" back="/theaters" /><main className="page-body"><ErrorState retryHref={`/theaters/${id}`} /></main></>);
  }
  if (!theater) notFound();
  const sp = await searchParams;
  const floor = theater.floors.includes(sp.floor ?? "") ? sp.floor! : theater.floors[0];
  const zones = theater.zones.filter((z) => z.floor === floor);
  const unzoned = await listUnzonedReviews(theater.id, floor).catch(() => []);

  return (
    <>
      <PageHeader title={theater.name} back="/theaters" />
      <main className="page-body">
        <p className="show-meta theater-meta">
          {[theater.address, theater.seat_count && `${theater.seat_count.toLocaleString()}석`].filter(Boolean).join(" · ")}
          {theater.map_url && <> · <a href={theater.map_url} target="_blank" rel="noopener noreferrer nofollow" className="link-inline">지도 ↗</a></>}
        </p>

        <nav className="chips floor-tabs" aria-label="층">
          {theater.floors.map((f) => (
            <Link key={f} href={`/theaters/${theater.id}?floor=${encodeURIComponent(f)}`} className="chip" aria-current={f === floor ? "true" : undefined} scroll={false}>{f}</Link>
          ))}
        </nav>

        {theater.zones.length === 0 ? (
          <p className="filter-note">구역 정보가 아직 없어요. 좌석 후기를 쓸 때 층과 구역 이름을 직접 적을 수 있어요.</p>
        ) : (
          <ul className="zone-grid">
            {zones.map((z) => (
              <li key={z.id}>
                <Link href={`/theaters/${theater.id}/zones/${z.id}`} className="zone-card">
                  <strong className="zone-name">{z.name}</strong>
                  <span className="zone-score">{z.avg_view != null ? <><span className="star" aria-hidden="true">★</span>{z.avg_view.toFixed(1)}</> : <span className="muted">평가 없음</span>}</span>
                  <span className="muted zone-count">후기 {z.review_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/theaters/${theater.id}/seat-reviews/new?floor=${encodeURIComponent(floor)}`} className="btn btn-primary btn-block seat-write">+ 좌석 후기 쓰기</Link>
        {unzoned.length > 0 && (
          <section className="section" aria-labelledby="unzoned-title">
            <h3 className="section-title" id="unzoned-title">{floor} 좌석 후기 <span className="muted">{unzoned.length}</span></h3>
            {unzoned.length < 3 && <p className="notice">후기가 적어 참고용이에요</p>}
            <ul className="review-list">{unzoned.map((r) => <li key={r.id}><SeatReviewItem r={r} /></li>)}</ul>
          </section>
        )}
      </main>
    </>
  );
}
