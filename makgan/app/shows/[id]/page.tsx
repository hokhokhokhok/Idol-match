import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Poster from "@/components/Poster";
import ActorChip from "@/components/ActorChip";
import ErrorState from "@/components/ErrorState";
import BenefitCard from "@/components/BenefitCard";
import { listBenefits, type Benefit } from "@/lib/data/benefits";
import { getCast, getShow, isDay } from "@/lib/data/shows";
import { formatDay, formatPeriod, kstDateString, showStatus } from "@/lib/date";

const STATUS_LABEL = { upcoming: "공연 예정", running: "공연 중", ended: "공연 종료" } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const show = await getShow((await params).id).catch(() => null);
  return { title: show ? `${show.title} · 막간` : "공연 · 막간" };
}

export default async function ShowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const { date: rawDate } = await searchParams;
  const picked = isDay(rawDate) ? rawDate : null;
  const today = kstDateString();

  let show, cast;
  let benefits: Benefit[] = [];
  try {
    show = await getShow(id);
    // 날짜를 고르지 않았으면 공연 기간 중엔 오늘 캐스팅을 보여 준다
    const date = picked ?? (show && show.starts_on <= today && today <= show.ends_on ? today : null);
    [cast, benefits] = show ? await Promise.all([getCast(id, date), listBenefits({ showId: id, limit: 10 })]) : [null, []];
  } catch {
    return (
      <>
        <PageHeader title="공연" back="/shows" />
        <main className="page-body"><ErrorState retryHref={`/shows/${id}`} /></main>
      </>
    );
  }
  if (!show || !cast) notFound();
  const status = showStatus(show.starts_on, show.ends_on);

  return (
    <>
      <PageHeader title={show.title} back="/shows" />
      <main className="page-body show-detail">
        <section className="show-hero">
          <Poster src={show.poster_url} alt={show.title} className="show-hero-poster" />
          <div className="show-hero-body">
            <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
            <h2 className="show-title">{show.title}</h2>
            {show.theater && <p className="show-meta">{show.theater.name}</p>}
            <p className="show-meta">{formatPeriod(show.starts_on, show.ends_on)}</p>
            <p className="show-rating" data-testid="rating">
              {show.review_count > 0 ? (
                <><span className="star" aria-hidden="true">★</span> {show.avg_rating?.toFixed(1)} <span className="muted">· 후기 {show.review_count}개</span></>
              ) : (
                <span className="muted">아직 후기가 없어요</span>
              )}
            </p>
          </div>
        </section>

        {benefits.length > 0 && (
          <section className="section">
            <h3 className="section-title">지금 받을 수 있는 혜택</h3>
            <ul className="benefit-list">
              {benefits.map((b) => <li key={b.id}><BenefitCard benefit={{ ...b, show: null }} /></li>)}
            </ul>
          </section>
        )}

        {show.synopsis && <section className="section"><h3 className="section-title">소개</h3><p className="synopsis">{show.synopsis}</p></section>}

        <section className="section">
          <div className="section-head">
            <h3 className="section-title" data-testid="cast-title">{cast.kind === "date" && cast.date ? `${formatDay(cast.date)} 캐스팅` : "시즌 캐스팅"}</h3>
            <form action={`/shows/${show.id}`} className="date-form">
              <label className="sr-only" htmlFor="cast-date">관람일</label>
              <input id="cast-date" type="date" name="date" defaultValue={picked ?? (today < show.starts_on ? show.starts_on : today > show.ends_on ? show.ends_on : today)} min={show.starts_on} max={show.ends_on} className="select" />
              <button className="btn">보기</button>
            </form>
          </div>
          {picked && cast.kind === "season" && <p className="filter-note">{formatDay(picked)} 캐스팅 정보가 없어 시즌 캐스팅을 보여드려요</p>}
          {cast.members.length === 0 ? (
            <p className="muted">캐스팅 정보가 아직 없어요</p>
          ) : (
            <ul className="actor-grid">
              {cast.members.map((m) => (
                <li key={`${m.actor_id}-${m.role_name}`}><ActorChip id={m.actor_id} name={m.name} photoUrl={m.photo_url} role={m.role_name} /></li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
