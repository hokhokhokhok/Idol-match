import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";
import LoginRequired from "@/components/LoginRequired";
import EmptyState from "@/components/EmptyState";
import ShowCard from "@/components/ShowCard";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { listMyWishlist } from "@/lib/data/wishlist";

export const metadata = { title: "MY · 막간" };

export default async function MePage() {
  const profile = await getProfile();
  if (profile && !profile.nickname) redirect("/onboarding?next=/me");
  const wishlist = profile ? await listMyWishlist().catch(() => []) : null;

  return (
    <>
      <PageHeader title="MY" />
      <main className="page-body">
        {!profile ? (
          <LoginRequired next="/me" />
        ) : (
          <>
            <section className="profile-row">
              <strong data-testid="nickname">{profile.nickname}</strong>
              {profile.is_admin && <span className="badge">관리자</span>}
              <form action={signOut}><button className="btn btn-text">로그아웃</button></form>
            </section>

            <section className="section" aria-labelledby="wish-title">
              <h3 className="section-title" id="wish-title">찜한 공연 <span className="muted">{wishlist?.length ?? 0}</span></h3>
              {!wishlist?.length ? (
                <EmptyState icon="♡" message="아직 찜한 공연이 없어요" action={{ label: "공연 둘러보기", href: "/shows" }} />
              ) : (
                <ul className="card-list">
                  {wishlist.map((s) => <li key={s.id}><ShowCard show={s} wished /></li>)}
                </ul>
              )}
            </section>
            <Placeholder icon="📒" title="내 관극 기록" step={8} />
          </>
        )}
      </main>
    </>
  );
}
