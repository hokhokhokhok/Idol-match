import { useCallback, useEffect, useState } from 'react';
import { QuestionView, nextMark, type MarkMap } from './components/QuestionView';
import { questionSets } from './lib/sets';
import type { ChoiceNo } from './types';

const FONT_SIZES = [15, 17, 19] as const;
type FontSize = (typeof FONT_SIZES)[number];
const FONT_KEY = 'ce:fontSize';

function loadFontSize(): FontSize {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return (FONT_SIZES as readonly number[]).includes(v) ? (v as FontSize) : 17;
  } catch {
    return 17;
  }
}

/**
 * 1단계 미리보기: 시드 세트를 시험지 조판으로 넘겨 보며 확인한다.
 * 시험 모드(타이머·OMR·제출)는 2단계에서 이 화면을 대체한다.
 */
export function App() {
  const set = questionSets[0];
  const [index, setIndex] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>(loadFontSize);
  const [answers, setAnswers] = useState<Record<string, ChoiceNo>>({});
  const [marks, setMarks] = useState<Record<string, MarkMap>>({});
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.fontSize = String(fontSize);
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      /* 사파리 개인정보 보호 모드 등: 저장 없이 진행 */
    }
  }, [fontSize]);

  const total = set?.questions.length ?? 0;
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  if (!set || total === 0) {
    return <main className="app-empty">src/data/sets 에 문항 세트(JSON)가 없습니다.</main>;
  }

  const q = set.questions[index];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <strong>민법 모의고사</strong>
          <span className="topbar-sub">{set.title} · 조판 미리보기</span>
        </div>
        <div className="topbar-tools">
          <div className="seg" role="group" aria-label="글자 크기">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={s === fontSize ? 'is-on' : ''}
                aria-pressed={s === fontSize}
                onClick={() => setFontSize(s)}
              >
                <span style={{ fontSize: s - 2 }}>가</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`chip${reveal ? ' is-on' : ''}`}
            aria-pressed={reveal}
            onClick={() => setReveal((r) => !r)}
          >
            정답 표시
          </button>
        </div>
      </header>

      <main className="paper-wrap">
        <div className="sheet" key={q.id}>
          <QuestionView
            question={q}
            selected={answers[q.id] ?? null}
            onSelect={(c) => setAnswers((a) => ({ ...a, [q.id]: c }))}
            marks={marks[q.id]}
            onToggleMark={(k) =>
              setMarks((m) => ({ ...m, [q.id]: { ...m[q.id], [k]: nextMark(m[q.id]?.[k]) } }))
            }
            reveal={reveal}
          />
        </div>
        <p className="meta">
          {q.unit} · {q.topic} · {typeLabel[q.type]} · 난이도 {q.difficulty}
        </p>
      </main>

      <nav className="pager" aria-label="문항 이동">
        <button type="button" className="pager-btn" onClick={() => go(index - 1)} disabled={index === 0}>
          ‹ 이전
        </button>
        <ol className="pager-nums">
          {set.questions.map((qq, i) => (
            <li key={qq.id}>
              <button
                type="button"
                className={`num${i === index ? ' is-current' : ''}${answers[qq.id] ? ' is-answered' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                aria-label={`${qq.number}번 문항${answers[qq.id] ? ' (응답함)' : ''}`}
                onClick={() => go(i)}
              >
                {qq.number}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="pager-btn" onClick={() => go(index + 1)} disabled={index === total - 1}>
          다음 ›
        </button>
      </nav>
    </div>
  );
}

const typeLabel = {
  single: '단일 정답형',
  count: '개수형',
  combo: '조합형',
  case: '사례형',
  precedent: '판례형',
} as const;
