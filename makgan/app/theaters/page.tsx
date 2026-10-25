import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { listTheaters } from "@/lib/data/theaters";

export const metadata = { title: "극장 · 막간" };

export default async function TheatersPage() {
  const theaters = await listTheaters().catch(() => null);
  return (
    <>
      <PageHeader title="극장" back="/shows" />
      <main className="page-body">
        {theaters === null ? <ErrorState retryHref="/theaters" /> : theaters.length === 0 ? (
          <EmptyState icon="🏛️" message="등록된 극장이 없어요" />
        ) : (
          <ul className="search-list">
            {theaters.map((t) => (
              <li key={t.id}>
                <Link href={`/theaters/${t.id}`}>
                  <strong>{t.name}</strong>
                  <span className="muted">{[t.address, t.seat_count && `${t.seat_count.toLocaleString()}석`, `구역 ${t.zone_count}`].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
