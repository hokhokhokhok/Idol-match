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
import { listMyReviewCasts, listMyReviews } from "@/lib/data/reviews";
import { computeStats } from "@/lib/stats";
import { kstDateString } from "@/lib/date";
import { listActors } from "@/lib/data/actors";

export const metadata = { title: "MY · 막간" };

const TABS = [
  { value: "records", label: "관극 기록" },
  { value: "wishlist", label: "찜" },
  { value: "following", label: "팔로잉" },
  { value: "stats", label: "통계" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
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

        <nav className="chips me-tabs" aria-label="내 기록">
          {TABS.map((t) => (
            <Link key={t.value} href={t.value === "records" ? "/me" : `/me?tab=${t.value}`} className="chip" aria-current={tab === t.value ? "true" : undefined}>{t.label}</Link>
          ))}
        </nav>

        {tab === "records" && <Records />}
        {tab === "wishlist" && <Wishlist />}
        {tab === "following" && <Following />}
        {tab === "stats" && <StatsTab year={sp.year} />}
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

async function StatsTab({ year: rawYear }: { year?: string }) {
  const thisYear = Number(kstDateString().slice(0, 4));
  const year = /^\d{4}$/.test(rawYear ?? "") ? Number(rawYear) : thisYear;
  const [reviews, casts] = await Promise.all([listMyReviews().catch(() => undefined), listMyReviewCasts().catch(() => [])]);
  if (reviews === undefined) return <ErrorState retryHref="/me?tab=stats" />;
  if (!reviews?.length) return <EmptyState icon="📊" message="첫 후기를 남겨볼까요?" action={{ label: "후기 쓰기", href: "/me/reviews/new" }} />;
  const s = computeStats(reviews, casts, year);
  const years = [...new Set([thisYear, ...s.years])].sort((a, b) => b - a);
  const max = Math.max(1, ...s.monthly);

  return (
    <section aria-label={`${year}년 통계`}>
      <nav className="chips" aria-label="연도">
        {years.map((y) => (
          <Link key={y} href={`/me?tab=stats&year=${y}`} className="chip" aria-current={y === year ? "true" : undefined}>{y}년</Link>
        ))}
      </nav>
      <dl className="stat-tiles">
        <div className="stat-tile"><dt>관극 횟수</dt><dd data-testid="stat-count">{s.count}회</dd></div>
        <div className="stat-tile"><dt>총 지출</dt><dd data-testid="stat-spent">{s.totalSpent.toLocaleString()}원</dd></div>
        <div className="stat-tile"><dt>평균 별점</dt><dd data-testid="stat-rating">{s.avgRating?.toFixed(1) ?? "–"}</dd></div>
      </dl>
      {s.count > s.pricedCount && <p className="form-hint">관람료를 적은 {s.pricedCount}회만 지출에 들어갔어요</p>}

      <h3 className="section-title stat-title">월별 관극</h3>
      <ol className="month-chart" aria-label="월별 관극 횟수">
        {s.monthly.map((n, i) => (
          <li key={i} aria-label={`${i + 1}월 ${n}회`}>
            <span className="month-count" aria-hidden="true">{n || ""}</span>
            <span className="month-bar" style={{ height: `${(n / max) * 100}%` }} aria-hidden="true" />
            <span className="month-label" aria-hidden="true">{i + 1}</span>
          </li>
        ))}
      </ol>

      <h3 className="section-title stat-title">많이 본 공연 TOP3</h3>
      {s.topShows.length === 0 ? <p className="muted">이 해의 기록이 없어요</p> : (
        <ol className="top-list" data-testid="top-shows">
          {s.topShows.map((x) => <li key={x.id}><Link href={`/shows/${x.id}`}>{x.name}</Link><span className="muted">{x.count}회</span></li>)}
        </ol>
      )}
      <h3 className="section-title stat-title">많이 본 배우 TOP3</h3>
      {s.topActors === null ? (
        <p className="muted">후기에 &lsquo;그날 캐스트&rsquo;를 고르면 배우 TOP3가 보여요</p>
      ) : (
        <ol className="top-list" data-testid="top-actors">
          {s.topActors.map((x) => <li key={x.id}><Link href={`/actors/${x.id}`}>{x.name}</Link><span className="muted">{x.count}회</span></li>)}
        </ol>
      )}
    </section>
  );
}
