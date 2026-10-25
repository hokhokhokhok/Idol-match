import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { listTerms, type Term } from "@/lib/data/glossary";
import { GROUP_ORDER, groupOf } from "@/lib/hangul";

export const metadata = { title: "용어 사전 · 막간" };

export default async function GlossaryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 30);
  const terms = await listTerms(q).catch(() => null);
  const groups = new Map<string, Term[]>();
  for (const t of terms ?? []) groups.set(groupOf(t.term), [...(groups.get(groupOf(t.term)) ?? []), t]);
  const ordered = GROUP_ORDER.filter((g) => groups.has(g));

  return (
    <>
      <PageHeader title="용어 사전" back="/me" />
      <main className="page-body">
        <form role="search" className="search-form" action="/glossary">
          <input type="search" name="q" defaultValue={q} maxLength={30} placeholder="용어나 뜻으로 찾기" aria-label="용어 검색" />
          <button className="btn btn-primary">찾기</button>
        </form>
        {terms === null ? <ErrorState retryHref="/glossary" /> : terms.length === 0 ? (
          q ? <p className="empty search-empty">찾는 용어가 없어요. 다른 단어로 검색해 보세요</p> : <EmptyState icon="📖" message="아직 등록된 용어가 없어요" />
        ) : (
          <>
            {ordered.length > 1 && (
              <nav className="chips glossary-index" aria-label="가나다">
                {ordered.map((g) => <a key={g} href={`#g-${g}`} className="chip">{g}</a>)}
              </nav>
            )}
            {ordered.map((g) => (
              <section key={g} id={`g-${g}`} className="glossary-group" aria-labelledby={`gh-${g}`}>
                <h2 className="glossary-head" id={`gh-${g}`}>{g}</h2>
                <ul className="glossary-list">
                  {groups.get(g)!.map((t) => (
                    <li key={t.id}>
                      <BottomSheet
                        title={t.term}
                        triggerClassName="glossary-term"
                        trigger={<><strong>{t.term}</strong>{t.status === "draft" && <span className="badge badge-muted">초안</span>}{t.category && <span className="muted">{t.category}</span>}</>}
                      >
                        <p className="glossary-meaning">{t.meaning}</p>
                        {t.example && <p className="glossary-example"><span className="muted">예)</span> {t.example}</p>}
                        {t.status === "draft" && <p className="form-hint">검수 전 초안이라 관리자에게만 보여요</p>}
                      </BottomSheet>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}
