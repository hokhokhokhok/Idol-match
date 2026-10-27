import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ActorChip from "@/components/ActorChip";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import LoginRequired from "@/components/LoginRequired";
import ActorGroups from "@/components/ActorGroups";
import { ACTOR_PAGE_SIZE, getActorGroups, listActors } from "@/lib/data/actors";
import { TIERS, TIER_NAMES, isTier, type Tier } from "@/lib/popularity";
import { getUser } from "@/lib/auth";

export const metadata = { title: "배우 · 막간" };

export default async function ActorsPage({ searchParams }: { searchParams: Promise<{ tab?: string; limit?: string; tier?: string }> }) {
  const { tab, limit: rawLimit, tier: rawTier } = await searchParams;
  if (tab === "popular") return <PopularTab tier={isTier(rawTier) ? rawTier : "S"} />;
  const followingOnly = tab === "following";
  const limit = Math.min(Math.max(Number(rawLimit) || ACTOR_PAGE_SIZE, ACTOR_PAGE_SIZE), 600);
  const user = await getUser();
  const base = followingOnly ? "/actors?tab=following" : "/actors";

  let result: Awaited<ReturnType<typeof listActors>> | null = null;
  let groups: Awaited<ReturnType<typeof getActorGroups>> | null = null;
  if (followingOnly) {
    if (user) {
      try { result = await listActors({ limit, followingOnly }); } catch { result = null; }
    }
  } else {
    try { groups = await getActorGroups(); } catch { groups = null; }
  }

  return (
    <>
      <PageHeader title="배우" />
      <main className="page-body">
        <nav className="chips" aria-label="배우 목록">
          <Link href="/actors" className="chip" aria-current={!followingOnly ? "true" : undefined}>전체</Link>
          <Link href="/actors?tab=following" className="chip" aria-current={followingOnly ? "true" : undefined}>팔로잉</Link>
          <Link href="/actors?tab=popular" className="chip">인기</Link>
        </nav>
        {followingOnly && !user ? (
          <LoginRequired next="/actors?tab=following" />
        ) : !followingOnly ? (
          groups === null ? <ErrorState retryHref={base} />
            : groups.length === 0 ? <EmptyState icon="🌟" message="등록된 배우가 없어요" />
            : <ActorGroups groups={groups} />
        ) : result === null ? (
          <ErrorState retryHref={base} />
        ) : result.items.length === 0 ? (
          <EmptyState icon="🌟" message="아직 팔로우한 배우가 없어요" action={{ label: "배우 둘러보기", href: "/actors" }} />
        ) : (
          <>
            <ul className="actor-grid">
              {result.items.map((a) => (
                <li key={a.id}><ActorChip id={a.id} name={a.name} photoUrl={a.photo_url} following={a.following} /></li>
              ))}
            </ul>
            {result.hasMore && (
              <Link href={`${base}${followingOnly ? "&" : "?"}limit=${limit + ACTOR_PAGE_SIZE}`} scroll={false} className="btn btn-block more-btn">더 보기</Link>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** 인기 탭: 등급은 색으로만 구분하고 점수·순위는 보여 주지 않는다. 등급 안에서는 이름 첫소리별로 묶는다. */
async function PopularTab({ tier }: { tier: Tier }) {
  let groups: Awaited<ReturnType<typeof getActorGroups>> | null = null;
  try {
    groups = await getActorGroups(tier);
  } catch {
    groups = null;
  }
  const base = `/actors?tab=popular&tier=${tier}`;
  return (
    <>
      <PageHeader title="배우" />
      <main className="page-body">
        <nav className="chips" aria-label="배우 목록">
          <Link href="/actors" className="chip">전체</Link>
          <Link href="/actors?tab=following" className="chip">팔로잉</Link>
          <Link href="/actors?tab=popular" className="chip" aria-current="true">인기</Link>
        </nav>
        <nav className="chips tier-chips" aria-label="인기 등급">
          {TIERS.map((t) => (
            <Link key={t} href={`/actors?tab=popular&tier=${t}`} className={`chip tier-chip-${t}`} aria-current={t === tier ? "true" : undefined}>
              {t} · {TIER_NAMES[t]}
            </Link>
          ))}
        </nav>
        <p className="tier-legend">작품 수·최근 활동·팔로워·후기·언급량을 종합해 색으로만 나눠요. 같은 등급 안에서는 가나다순이에요.</p>
        {groups === null ? <ErrorState retryHref={base} /> : groups.length === 0 ? (
          <EmptyState icon="🌟" message="이 등급에 해당하는 배우가 아직 없어요" />
        ) : (
          <ActorGroups key={tier} groups={groups} tier={tier} />
        )}
      </main>
    </>
  );
}
