import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, updateNote } from '../lib/db';
import { parseInline, type InlineNode } from '../lib/inline';
import { questionById } from '../lib/sets';
import { dueLabel, isDue, type Note } from '../lib/srs';

type Filter = 'due' | 'active' | 'starred' | 'mastered';
const FILTERS: { key: Filter; label: string; test: (n: Note, now: number) => boolean }[] = [
  { key: 'due', label: '오늘 복습', test: (n, now) => isDue(n, now) },
  { key: 'active', label: '진행 중', test: (n) => !n.mastered },
  { key: 'starred', label: '별표', test: (n) => n.starred },
  { key: 'mastered', label: '졸업', test: (n) => n.mastered },
];

const plain = (nodes: InlineNode[]): string =>
  nodes.map((n) => (n.kind === 'text' ? n.text : plain(n.children))).join('');

type Props = { onPractice: (ids: string[]) => void; onHome: () => void };

/** 오답노트: 틀린 문항 자동 수집, 별표·메모, 1·3·7일 간격 다시 풀기 */
export function NotesScreen({ onPractice, onHome }: Props) {
  const all = useLiveQuery(() => db.notes.toArray(), []);
  const [filter, setFilter] = useState<Filter>('due');
  const [memoOpen, setMemoOpen] = useState<string | null>(null);
  const now = Date.now();

  const notes = (all ?? []).filter((n) => questionById.has(n.questionId));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, notes.filter((n) => f.test(n, now)).length]));
  const shown = notes
    .filter((n) => FILTERS.find((f) => f.key === filter)!.test(n, now))
    .sort((a, b) => Number(a.mastered) - Number(b.mastered) || a.dueAt - b.dueAt || b.lastWrongAt - a.lastWrongAt);
  const dueIds = notes.filter((n) => isDue(n, now)).sort((a, b) => a.dueAt - b.dueAt).map((n) => n.questionId);

  return (
    <div className="result">
      <header className="topbar">
        <div className="topbar-title">
          <strong>오답노트</strong>
          <span className="topbar-sub">틀리면 1일 → 3일 → 7일 뒤 다시, 세 번 연속 맞히면 졸업</span>
        </div>
        <button type="button" className="btn" onClick={onHome}>
          홈으로
        </button>
      </header>

      <main className="home-main">
        <section className="card card-resume">
          <div>
            <h2>오늘 복습할 문항 {dueIds.length}개</h2>
            <p className="muted">진행 중 {counts.active}개 · 졸업 {counts.mastered}개</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={dueIds.length === 0}
            onClick={() => onPractice(dueIds)}
          >
            복습 시작
          </button>
        </section>

        <div className="tabs" role="tablist" aria-label="오답노트 필터">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`chip${filter === f.key ? ' is-on' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>

        {all && shown.length === 0 && (
          <p className="empty-note">
            {notes.length === 0 ? '아직 틀린 문항이 없습니다. 실전에서 틀린 문항이 여기에 모입니다.' : '이 목록은 비어 있습니다.'}
          </p>
        )}

        <ul className="note-list">
          {shown.map((n) => {
            const q = questionById.get(n.questionId)!;
            const label = dueLabel(n, now);
            return (
              <li key={n.questionId} className="card note">
                <div className="note-head">
                  <span className="note-tag">{q.unit}</span>
                  <span className="note-topic">{q.topic}</span>
                  <span className={`note-due${label === '오늘' ? ' is-due' : ''}`}>{label}</span>
                </div>
                <p className="note-stem">{plain(parseInline(q.stem))}</p>
                <p className="muted small">
                  {q.setId} {q.number}번 · 틀림 {n.wrongCount}회{n.reviewCount ? ` · 복습 ${n.reviewCount}회` : ''}
                </p>
                {n.memo && memoOpen !== n.questionId && <p className="note-memo">{n.memo}</p>}
                {memoOpen === n.questionId && (
                  <MemoEditor
                    initial={n.memo}
                    onSave={(memo) => {
                      updateNote(n.questionId, { memo });
                      setMemoOpen(null);
                    }}
                  />
                )}
                <div className="note-actions">
                  <button
                    type="button"
                    className={`btn btn-flag${n.starred ? ' is-on' : ''}`}
                    aria-pressed={n.starred}
                    onClick={() => updateNote(n.questionId, { starred: !n.starred })}
                  >
                    <span aria-hidden>{n.starred ? '★' : '☆'}</span> 별표
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-expanded={memoOpen === n.questionId}
                    onClick={() => setMemoOpen(memoOpen === n.questionId ? null : n.questionId)}
                  >
                    메모
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => onPractice([n.questionId])}>
                    풀기
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function MemoEditor({ initial, onSave }: { initial: string; onSave: (memo: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="memo-edit">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="헷갈린 점, 근거 조문 등"
        aria-label="메모"
        autoFocus
      />
      <button type="button" className="btn btn-primary" onClick={() => onSave(text.trim())}>
        저장
      </button>
    </div>
  );
}
