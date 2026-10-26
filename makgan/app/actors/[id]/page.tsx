import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import TierRing from "@/components/TierRing";
import ShowCard from "@/components/ShowCard";
import FollowButton from "@/components/FollowButton";
import ErrorState from "@/components/ErrorState";
import { getActor, getActorRelations, getActorTier } from "@/lib/data/actors";
import { myWishlistIds } from "@/lib/data/wishlist";
import { listVideos, type Video } from "@/lib/data/videos";
import RelationGraph from "@/components/RelationGraph";
import VideoSection from "@/components/VideoSection";
import { kstDateString } from "@/lib/date";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor((await params).id).catch(() => null);
  return { title: actor ? `${actor.name} · 막간` : "배우 · 막간" };
}

export default async function ActorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  let wished = new Set<string>();
  let videos: Video[] = [];
  try {
    [actor, wished, videos] = await Promise.all([getActor(id), myWishlistIds(), listVideos({ actorId: id })]);
  } catch {
    return (
      <>
        <PageHeader title="배우" back="/actors" />
        <main className="page-body"><ErrorState retryHref={`/actors/${id}`} /></main>
      </>
    );
  }
  if (!actor) notFound();
  // 관계도는 부가 정보라 실패해도 페이지는 보여 준다
  const tier = await getActorTier(actor.id);
  const relations = await getActorRelations(actor.id, actor.name).catch(() => null);

  const today = kstDateString();
  const current = actor.shows.filter((s) => s.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const past = actor.shows.filter((s) => s.ends_on < today);
  // 필모그래피: 지난 공연을 연도별로 쌓아 보여 준다(최근 연도 먼저)
  const years = [...new Set(past.map((s) => s.ends_on.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  return (
    <>
      <PageHeader title={actor.name} back="/actors" />
      <main className="page-body">
        <section className="actor-hero">
          <TierRing tier={tier}><Avatar src={actor.photo_url} alt={actor.name} size={88} /></TierRing>
          <div className="actor-hero-body">
            <h2 className="show-title">{actor.name}</h2>
            <FollowButton actorId={actor.id} name={actor.name} following={actor.following} />
          </div>
        </section>
        {actor.bio && <p className="synopsis section">{actor.bio}</p>}

        <section className="section">
          <h3 className="section-title">공연 중 · 예정 <span className="muted">{current.length}</span></h3>
          {current.length === 0 ? <p className="muted">지금 출연 중인 공연이 없어요</p> : (
            <ul className="card-list">
              {current.map((s) => <li key={s.id}><ShowCard show={s} note={s.roles.join(", ")} wished={wished.has(s.id)} /></li>)}
            </ul>
          )}
        </section>
        {past.length > 0 && (
          <section className="section">
            <h3 className="section-title">필모그래피 <span className="muted">지난 공연 {past.length}편</span></h3>
            {years.map((y) => (
              <div key={y} className="film-year">
                <h4 className="film-year-title">{y}년 <span className="muted">{past.filter((s) => s.ends_on.startsWith(y)).length}</span></h4>
                <ul className="card-list">
                  {past.filter((s) => s.ends_on.startsWith(y)).map((s) => <li key={s.id}><ShowCard show={s} note={s.roles.join(", ")} wished={wished.has(s.id)} /></li>)}
                </ul>
              </div>
            ))}
          </section>
        )}
        {relations && (
          <section className="section" id="relations">
            <h3 className="section-title">함께한 배우 관계도 <span className="muted">{relations.total}</span></h3>
            {relations.nodes.length === 0
              ? <p className="muted">같은 공연에 출연한 다른 배우 정보가 아직 없어요</p>
              : <RelationGraph key={actor.id} graph={relations} />}
          </section>
        )}
        <VideoSection videos={videos} />
        {actor.shows.length > 0 && (
          <Link href={`/shows?actor=${actor.id}&status=all`} className="filter-note link">공연 목록에서 출연작 모두 보기 →</Link>
        )}
      </main>
    </>
  );
}
