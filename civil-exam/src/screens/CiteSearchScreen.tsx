import { useMemo } from 'react';
import { citeMatches } from '../lib/law';
import { questionSets } from '../lib/sets';
import { categoryOf, SUBJECT_LABEL, type Question } from '../types';

type Props = {
  query: string;
  onQuery: (q: string) => void;
  onOpen: (questionIds: string[], index: number) => void;
  onBack: () => void;
};

/** 문항의 근거 조문 목록 (감관법 legalBasis, 민법 statutes) */
const citesOf = (q: Question): string[] =>
  q.subject === '감관법' ? q.explanation.legalBasis.map((b) => b.cite) : q.subject === '민법' ? q.explanation.statutes : [];

const all = questionSets.flatMap((s) => s.questions);

/** 법령 개정 대응: 근거 조문으로 문항 찾기 ("이 조문을 쓰는 문항 보기") */
export function CiteSearchScreen({ query, onQuery, onOpen, onBack }: Props) {
  const hits = useMemo(
    () =>
      query.trim()
        ? all.flatMap((q) => {
            const matched = citesOf(q).filter((c) => citeMatches(c, query));
            return matched.length ? [{ q, matched }] : [];
          })
        : [],
    [query],
  );
  const frequent = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of all) if (q.subject === '감관법') for (const c of citesOf(q)) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
  }, []);
  const ids = hits.map((h) => h.q.id);

  return (
    <div className="result">
      <header className="topbar">
        <div className="topbar-title">
          <strong>조문으로 문항 찾기</strong>
          <span className="topbar-sub">법령이 개정되면 영향받는 문항을 찾아 다시 검수하세요</span>
        </div>
        <button type="button" className="btn" onClick={onBack}>
          ‹ 설정
        </button>
      </header>
      <main className="home-main">
        <section className="card">
          <label className="search">
            <span className="sr-only">조문 검색</span>
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="예: 국토계획법 시행령 제84조, 건축법 제2조, 부동산등기법"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          <p className="muted small">
            공백과 약칭(국토계획법·공간정보법·등기법 등)은 무시하고 찾습니다. "제84조"로 찾으면 "제84조의2"는 빠집니다.
          </p>
        </section>

        {query.trim() ? (
          <>
            <h2 className="section-title">이 조문을 쓰는 문항 {hits.length}개</h2>
            <ul className="note-list">
              {hits.map((h, i) => (
                <li key={h.q.id}>
                  <button type="button" className="card cite-hit" onClick={() => onOpen(ids, i)}>
                    <span className="note-head">
                      <span className="note-tag">{categoryOf(h.q)}</span>
                      <span className="note-topic">{h.q.topic}</span>
                      {!h.q.reviewed && <span className="pill">미검수</span>}
                    </span>
                    <span className="muted small">
                      {SUBJECT_LABEL[h.q.subject]} · {h.q.setId} {h.q.number}번 · {h.matched.join(', ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          frequent.length > 0 && (
            <>
              <h2 className="section-title">감관법 문항이 많이 인용한 조문</h2>
              <div className="chips-wrap">
                {frequent.map(([c, n]) => (
                  <button key={c} type="button" className="chip" onClick={() => onQuery(c)}>
                    {c} <span className="muted-inline">{n}</span>
                  </button>
                ))}
              </div>
            </>
          )
        )}
      </main>
    </div>
  );
}
