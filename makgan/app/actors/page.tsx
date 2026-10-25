import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ActorChip from "@/components/ActorChip";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import LoginRequired from "@/components/LoginRequired";
import { ACTOR_PAGE_SIZE, listActors } from "@/lib/data/actors";
import { getUser } from "@/lib/auth";

export const metadata = { title: "배우 · 막간" };

export default async function ActorsPage({ searchParams }: { searchParams: Promise<{ tab?: string; limit?: string }> }) {
  const { tab, limit: rawLimit } = await searchParams;
  const followingOnly = tab === "following";
  const limit = Math.min(Math.max(Number(rawLimit) || ACTOR_PAGE_SIZE, ACTOR_PAGE_SIZE), 600);
  const user = await getUser();
  const base = followingOnly ? "/actors?tab=following" : "/actors";

  let result: Awaited<ReturnType<typeof listActors>> | null = null;
  if (!followingOnly || user) {
    try {
      result = await listActors({ limit, followingOnly });
    } catch {
      result = null;
    }
  }

  return (
    <>
      <PageHeader title="배우" />
      <main className="page-body">
        <nav className="chips" aria-label="배우 목록">
          <Link href="/actors" className="chip" aria-current={!followingOnly ? "true" : undefined}>전체</Link>
          <Link href="/actors?tab=following" className="chip" aria-current={followingOnly ? "true" : undefined}>팔로잉</Link>
        </nav>
        {followingOnly && !user ? (
          <LoginRequired next="/actors?tab=following" />
        ) : result === null ? (
          <ErrorState retryHref={base} />
        ) : result.items.length === 0 ? (
          followingOnly
            ? <EmptyState icon="🌟" message="아직 팔로우한 배우가 없어요" action={{ label: "배우 둘러보기", href: "/actors" }} />
            : <EmptyState icon="🌟" message="등록된 배우가 없어요" />
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
