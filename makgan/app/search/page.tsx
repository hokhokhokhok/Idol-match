import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import ErrorState from "@/components/ErrorState";
import { search } from "@/lib/data/search";
import { formatPeriod } from "@/lib/date";
import SearchBox from "./SearchBox";

export const metadata = { title: "검색 · 막간" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 50);
  let result: Awaited<ReturnType<typeof search>> | null = null;
  let failed = false;
  if (q) {
    try {
      result = await search(q);
    } catch {
      failed = true;
    }
  }
  const empty = result && !result.shows.length && !result.actors.length && !result.theaters.length;

  return (
    <>
      <PageHeader title="검색" action={<span />} />
      <main className="page-body">
        <SearchBox key={q} initial={q} />
        {failed && <ErrorState retryHref={`/search?q=${encodeURIComponent(q)}`} />}
        {empty && <p className="empty search-empty">찾는 공연이 없어요. 다른 단어로 검색해 보세요</p>}
        {result && !empty && (
          <>
            {result.shows.length > 0 && (
              <section className="section" aria-labelledby="sr-shows">
                <div className="section-head">
                  <h2 className="section-title" id="sr-shows">공연</h2>
                </div>
                <ul className="search-list">
                  {result.shows.map((s) => (
                    <li key={s.id}><Link href={`/shows/${s.id}`}><strong>{s.title}</strong><span className="muted">{[s.theater?.name, formatPeriod(s.starts_on, s.ends_on)].filter(Boolean).join(" · ")}</span></Link></li>
                  ))}
                </ul>
              </section>
            )}
            {result.actors.length > 0 && (
              <section className="section" aria-labelledby="sr-actors">
                <h2 className="section-title" id="sr-actors">배우</h2>
                <ul className="search-list">
                  {result.actors.map((a) => (
                    <li key={a.id}><Link href={`/actors/${a.id}`} className="search-actor"><Avatar src={a.photo_url} alt={a.name} size={36} /><strong>{a.name}</strong></Link></li>
                  ))}
                </ul>
              </section>
            )}
            {result.theaters.length > 0 && (
              <section className="section" aria-labelledby="sr-theaters">
                <h2 className="section-title" id="sr-theaters">극장</h2>
                <ul className="search-list">
                  {result.theaters.map((t) => (
                    <li key={t.id}><Link href={`/shows?theater=${t.id}&status=all`}><strong>{t.name}</strong>{t.address && <span className="muted">{t.address}</span>}</Link></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
