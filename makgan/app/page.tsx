import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import BenefitCard from "@/components/BenefitCard";
import ShowCardVertical from "@/components/ShowCardVertical";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { getHome } from "@/lib/data/home";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function HomePage() {
  let home: Awaited<ReturnType<typeof getHome>> | null;
  try {
    home = await getHome();
  } catch {
    home = null;
  }
  const now = new Date();

  return (
    <>
      <PageHeader title="막간" />
      <main className="page-body">
        {!isSupabaseConfigured && (
          <p className="notice">Supabase 연결 전이에요. README의 “Supabase 연결”을 따라 .env.local을 만들어 주세요.</p>
        )}
        {home === null ? (
          <ErrorState retryHref="/" />
        ) : (
          <>
            <section className="home-section" aria-labelledby="today-title">
              <div className="section-head">
                <h2 className="section-title" id="today-title">오늘 마감</h2>
                <Link href="/benefits?when=today" className="more-link">전체 보기</Link>
              </div>
              {home.endingToday.length === 0 ? (
                <EmptyState icon="⏰" message="오늘 마감되는 혜택은 없어요" action={{ label: "전체 혜택 보기", href: "/benefits" }} />
              ) : (
                <ul className="benefit-list">
                  {home.endingToday.map((b) => <li key={b.id}><BenefitCard benefit={b} now={now} /></li>)}
                </ul>
              )}
            </section>

            <section className="home-section" aria-labelledby="open-title">
              <div className="section-head">
                <h2 className="section-title" id="open-title">곧 열리는 티켓</h2>
                <Link href="/benefits?type=ticket_open" className="more-link">전체 보기</Link>
              </div>
              {home.upcomingOpen.length === 0 ? (
                <p className="muted">예정된 티켓오픈이 아직 없어요</p>
              ) : (
                <ul className="benefit-list">
                  {home.upcomingOpen.map((b) => <li key={b.id}><BenefitCard benefit={b} now={now} /></li>)}
                </ul>
              )}
            </section>

            <section className="home-section" aria-labelledby="wish-title">
              <div className="section-head">
                <h2 className="section-title" id="wish-title">내 찜 공연</h2>
                {home.wishlist && home.wishlist.length > 0 && <Link href="/me" className="more-link">전체 보기</Link>}
              </div>
              {home.wishlist === null ? (
                <EmptyState icon="🔒" message="로그인하면 기록을 저장할 수 있어요" action={{ label: "로그인", href: "/login?next=%2F" }} />
              ) : home.wishlist.length === 0 ? (
                <EmptyState icon="♡" message="아직 찜한 공연이 없어요" action={{ label: "공연 둘러보기", href: "/shows" }} />
              ) : (
                <ul className="hscroll">
                  {home.wishlist.map((s) => <li key={s.id}><ShowCardVertical show={s} wished /></li>)}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
