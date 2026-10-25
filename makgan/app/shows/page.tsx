import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { hidesShort, listShows, listTheaterOptions, SHORT_RUN_DAYS } from "@/lib/data/shows";
import { parseShowParams } from "@/lib/show-params";
import { myWishlistIds } from "@/lib/data/wishlist";
import ShowList from "./ShowList";
import BottomSheet from "@/components/BottomSheet";

export const metadata = { title: "공연 · 막간" };

const STATUS_TABS = [
  { value: "current", label: "전체" },
  { value: "running", label: "공연 중" },
  { value: "upcoming", label: "공연 예정" },
  { value: "ended", label: "지난 공연" },
] as const;
const SORTS = [
  { value: "ending", label: "마감 임박순" },
  { value: "opening", label: "개막 임박순" },
  { value: "newest", label: "최신 개막순" },
  { value: "title", label: "가나다순" },
] as const;

export default async function ShowsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseShowParams(await searchParams);
  // 화면 상태를 다시 URL로(기본값은 생략)
  const query: Record<string, string> = {};
  if (params.status !== "current") query.status = params.status!;
  if (params.sort !== "ending") query.sort = params.sort!;
  if (params.theaterId) query.theater = params.theaterId;
  if (params.actorId) query.actor = params.actorId;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.includeShort) query.short = "1";
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ ...query });
    for (const [k, v] of Object.entries(patch)) v === undefined ? q.delete(k) : q.set(k, v);
    const s = q.toString();
    return s ? `/shows?${s}` : "/shows";
  };

  let result: Awaited<ReturnType<typeof listShows>> | null = null;
  let theaters: { id: string; name: string }[] = [];
  let wished = new Set<string>();
  try {
    [result, theaters, wished] = await Promise.all([listShows(params), listTheaterOptions(), myWishlistIds()]);
  } catch {
    result = null;
  }
  const filtered = Boolean(params.theaterId || params.actorId || params.from || params.to);

  return (
    <>
      <PageHeader title="공연" />
      <main className="page-body">
        <nav className="chips" aria-label="공연 상태">
          {STATUS_TABS.map((t) => (
            <Link key={t.value} href={href({ status: t.value === "current" ? undefined : t.value })} className="chip" aria-current={params.status === t.value ? "true" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="filter-row">
          <BottomSheet
            title="정렬 · 필터"
            triggerClassName="btn filter-btn"
            trigger={<>필터 · {SORTS.find((x) => x.value === params.sort)?.label}{params.theaterId ? ` · ${theaters.find((t) => t.id === params.theaterId)?.name ?? "극장"}` : ""}</>}
          >
            <form className="form" action="/shows">
              {Object.entries(query).filter(([k]) => k !== "sort" && k !== "theater").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label className="field">
                <span>정렬</span>
                <select name="sort" defaultValue={params.sort}>
                  {SORTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>극장</span>
                <select name="theater" defaultValue={params.theaterId ?? ""}>
                  <option value="">모든 극장</option>
                  {theaters.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <button className="btn btn-primary btn-block">적용</button>
            </form>
          </BottomSheet>
          <Link href="/theaters" className="btn filter-btn">극장 보기</Link>
        </div>
        {hidesShort(params) ? (
          <p className="filter-note">{SHORT_RUN_DAYS}일 이하 단기 공연(지방 순회·단발 공연)은 숨겼어요 <Link href={href({ short: "1" })}>같이 보기</Link></p>
        ) : params.includeShort && !filtered ? (
          <p className="filter-note">단기 공연도 같이 보고 있어요 <Link href={href({ short: undefined })}>숨기기</Link></p>
        ) : null}
        {filtered && (
          <p className="filter-note">
            조건이 적용된 목록이에요 <Link href={href({ theater: undefined, actor: undefined, from: undefined, to: undefined })}>조건 지우기</Link>
          </p>
        )}

        {result === null ? (
          <ErrorState retryHref={href({})} />
        ) : result.items.length === 0 ? (
          <EmptyState icon="🎭" message="조건에 맞는 공연이 없어요" action={{ label: "전체 공연 보기", href: "/shows" }} />
        ) : (
          <ShowList key={JSON.stringify(query)} initial={result.items} nextCursor={result.nextCursor} query={query} wished={result.items.filter((s) => wished.has(s.id)).map((s) => s.id)} />
        )}
      </main>
    </>
  );
}
