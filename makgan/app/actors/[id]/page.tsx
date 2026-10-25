import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import ShowCard from "@/components/ShowCard";
import FollowButton from "@/components/FollowButton";
import ErrorState from "@/components/ErrorState";
import { getActor } from "@/lib/data/actors";
import { myWishlistIds } from "@/lib/data/wishlist";
import { kstDateString } from "@/lib/date";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor((await params).id).catch(() => null);
  return { title: actor ? `${actor.name} · 막간` : "배우 · 막간" };
}

export default async function ActorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  let wished = new Set<string>();
  try {
    [actor, wished] = await Promise.all([getActor(id), myWishlistIds()]);
  } catch {
    return (
      <>
        <PageHeader title="배우" back="/actors" />
        <main className="page-body"><ErrorState retryHref={`/actors/${id}`} /></main>
      </>
    );
  }
  if (!actor) notFound();

  const today = kstDateString();
  const current = actor.shows.filter((s) => s.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const past = actor.shows.filter((s) => s.ends_on < today);

  return (
    <>
      <PageHeader title={actor.name} back="/actors" />
      <main className="page-body">
        <section className="actor-hero">
          <Avatar src={actor.photo_url} alt={actor.name} size={88} />
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
            <h3 className="section-title">지난 공연 <span className="muted">{past.length}</span></h3>
            <ul className="card-list">
              {past.map((s) => <li key={s.id}><ShowCard show={s} note={s.roles.join(", ")} wished={wished.has(s.id)} /></li>)}
            </ul>
          </section>
        )}
        {actor.shows.length > 0 && (
          <Link href={`/shows?actor=${actor.id}&status=all`} className="filter-note link">공연 목록에서 출연작 모두 보기 →</Link>
        )}
      </main>
    </>
  );
}
