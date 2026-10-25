import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import LoginRequired from "@/components/LoginRequired";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import ShowCard from "@/components/ShowCard";
import ActorChip from "@/components/ActorChip";
import ReviewItem from "@/components/ReviewItem";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { listMyWishlist } from "@/lib/data/wishlist";
import { listMyReviews } from "@/lib/data/reviews";
import { listActors } from "@/lib/data/actors";

export const metadata = { title: "MY · 막간" };

const TABS = [
  { value: "records", label: "관극 기록" },
  { value: "wishlist", label: "찜" },
  { value: "following", label: "팔로잉" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "records";
  const profile = await getProfile();
  if (profile && !profile.nickname) redirect("/onboarding?next=/me");

  if (!profile) {
    return (
      <>
        <PageHeader title="MY" />
        <main className="page-body"><LoginRequired next="/me" /></main>
      </>
    );
  }

  return (
    <>
      <PageHeader title="MY" />
      <main className="page-body">
        <section className="profile-row">
          <strong data-testid="nickname">{profile.nickname}</strong>
          {profile.is_admin && <Link href="/admin" className="badge">관리자</Link>}
          <form action={signOut}><button className="btn btn-text">로그아웃</button></form>
        </section>
        {sp.saved === "review" && <p className="notice" role="status">후기를 저장했어요</p>}

        <nav className="chips me-tabs" aria-label="내 기록">
          {TABS.map((t) => (
            <Link key={t.value} href={t.value === "records" ? "/me" : `/me?tab=${t.value}`} className="chip" aria-current={tab === t.value ? "true" : undefined}>{t.label}</Link>
          ))}
        </nav>

        {tab === "records" && <Records />}
        {tab === "wishlist" && <Wishlist />}
        {tab === "following" && <Following />}
      </main>
    </>
  );
}

async function Records() {
  const reviews = await listMyReviews().catch(() => undefined);
  if (reviews === undefined) return <ErrorState retryHref="/me" />;
  if (!reviews?.length) return <EmptyState icon="📒" message="첫 후기를 남겨볼까요?" action={{ label: "후기 쓰기", href: "/me/reviews/new" }} />;
  return (
    <>
      <Link href="/me/reviews/new" className="btn btn-primary btn-block">+ 후기 쓰기</Link>
      <ul className="review-list">
        {reviews.map((r) => (
          <li key={r.id}><ReviewItem review={r} heading={{ text: r.show.title, href: `/shows/${r.show.id}` }} mine /></li>
        ))}
      </ul>
    </>
  );
}

async function Wishlist() {
  const wishlist = await listMyWishlist().catch(() => undefined);
  if (wishlist === undefined) return <ErrorState retryHref="/me?tab=wishlist" />;
  if (!wishlist?.length) return <EmptyState icon="♡" message="아직 찜한 공연이 없어요" action={{ label: "공연 둘러보기", href: "/shows" }} />;
  return (
    <ul className="card-list">
      {wishlist.map((s) => <li key={s.id}><ShowCard show={s} wished /></li>)}
    </ul>
  );
}

async function Following() {
  const r = await listActors({ followingOnly: true, limit: 600 }).catch(() => undefined);
  if (r === undefined) return <ErrorState retryHref="/me?tab=following" />;
  if (!r.items.length) return <EmptyState icon="🌟" message="아직 팔로우한 배우가 없어요" action={{ label: "배우 둘러보기", href: "/actors" }} />;
  return (
    <ul className="actor-grid">
      {r.items.map((a) => <li key={a.id}><ActorChip id={a.id} name={a.name} photoUrl={a.photo_url} following /></li>)}
    </ul>
  );
}
