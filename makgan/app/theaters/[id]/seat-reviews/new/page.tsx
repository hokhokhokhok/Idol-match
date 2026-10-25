import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SeatReviewForm from "@/components/SeatReviewForm";
import { requireProfile } from "@/lib/auth";
import { createSeatReview } from "@/lib/actions/seat-reviews";
import { getTheater } from "@/lib/data/theaters";
import { seatFormOptions } from "@/lib/data/seat-reviews";
import { isDay, isUuid } from "@/lib/data/shows";
import { kstDateString } from "@/lib/date";

export const metadata = { title: "좌석 후기 쓰기 · 막간" };

type Query = { floor?: string; zone?: string; review?: string; show?: string; watched?: string; seat?: string };

export default async function NewSeatReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  const q = await searchParams;
  await requireProfile(`/theaters/${id}/seat-reviews/new`);
  const theater = await getTheater(id);
  if (!theater) notFound();
  const { zones, shows } = await seatFormOptions(id);
  const zone = zones.find((z) => z.id === q.zone);

  return (
    <>
      <PageHeader title="좌석 후기 쓰기" back={zone ? `/theaters/${id}/zones/${zone.id}` : `/theaters/${id}`} action={<span />} />
      <main className="page-body">
        <p className="lead">{theater.name}</p>
        {q.seat && <p className="filter-note">관극 후기에 적은 좌석: <strong>{q.seat.slice(0, 50)}</strong></p>}
        <SeatReviewForm
          action={createSeatReview.bind(null, id)}
          zones={zones}
          floors={theater.floors}
          shows={shows}
          today={kstDateString()}
          initial={{
            floor: zone?.floor ?? q.floor ?? "",
            zone_id: zone?.id ?? "",
            review_id: isUuid(q.review) ? q.review : "",
            show_id: isUuid(q.show) && shows.some((s) => s.id === q.show) ? q.show : "",
            watched_at: isDay(q.watched) ? q.watched : "",
          }}
        />
      </main>
    </>
  );
}
