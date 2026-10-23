import { useCallback, useEffect, useState } from 'react';
import { newAttempt, type Attempt } from './lib/attempt';
import { blueprints, timeLimitSec } from './lib/config';
import { db, loadDraft, saveDraft, saveSubmission, type AttemptRecord } from './lib/db';
import { buildSubmission } from './lib/records';
import { buildDrill, buildMix, buildWeakDrill } from './lib/plan';
import { isSeedSet, MIX_PREFIX, questionSets, resolveSet, setsOf, subjectOf } from './lib/sets';
import { isDue } from './lib/srs';
import { weakCategories } from './lib/stats';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './lib/settings';
import { BrowseScreen } from './screens/BrowseScreen';
import { CardsScreen } from './screens/CardsScreen';
import { CiteSearchScreen } from './screens/CiteSearchScreen';
import { ExamScreen } from './screens/ExamScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotesScreen } from './screens/NotesScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShiftQuizScreen } from './screens/ShiftQuizScreen';
import { StatsScreen } from './screens/StatsScreen';
import { isCalc, type Category, type Subject } from './types';

type View =
  | { name: 'home' }
  | { name: 'exam' }
  | { name: 'result'; record: AttemptRecord; saveFailed?: boolean }
  | { name: 'review'; record: AttemptRecord; number?: number; wrongOnly?: boolean }
  | { name: 'notes' }
  | { name: 'practice'; questionIds: string[]; from: 'notes' | 'home'; title?: string }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'cards' }
  | { name: 'shift-quiz' }
  | { name: 'cite-search' }
  | { name: 'browse'; questionIds: string[]; start: number };

const findSet = (id: string) => questionSets.find((s) => s.id === id);
/** 맞춤 세트·고정 세트 공통: 응시(또는 기록)가 가리키는 세트 */
const setOf = (a: { setId: string; questionIds?: string[]; subject?: Subject }) => resolveSet(a);

/** 문항 id → 지금까지 푼 횟수·틀린 횟수 */
async function questionHistory() {
  const rows = await db.results.toArray();
  const history = new Map<string, { seen: number; wrong: number }>();
  for (const r of rows) {
    const h = history.get(r.questionId) ?? { seen: 0, wrong: 0 };
    h.seen += 1;
    if (!r.correct) h.wrong += 1;
    history.set(r.questionId, h);
  }
  return { rows, history };
}

export function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [draft, setDraftState] = useState<Attempt | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: 'home' });
  const [citeQuery, setCiteQuery] = useState('');

  useEffect(() => {
    loadSettings()
      .catch((e) => {
        console.error('settings load failed', e);
        return DEFAULT_SETTINGS;
      })
      .then(setSettingsState);
    loadDraft()
      .then((d) => setDraftState(d && setOf(d) ? d : null))
      .catch((e) => {
        console.error('draft load failed', e);
        setDraftState(null);
      });
  }, []);

  useEffect(() => {
    if (settings) document.documentElement.dataset.fontSize = String(settings.fontSize);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...(prev ?? DEFAULT_SETTINGS), ...patch };
      saveSettings(next).catch((e) => console.error('settings save failed', e));
      return next;
    });
  }, []);

  const setDraft = useCallback((a: Attempt | null) => {
    setDraftState(a);
    saveDraft(a).catch((e) => console.error('draft save failed', e));
  }, []);

  const submit = useCallback(async (final: Attempt, timeUp: boolean) => {
    const set = setOf(final)!;
    const { record, rows } = buildSubmission(set.questions, { ...final, subject: final.subject ?? set.subject, timeUp });
    setDraftState(null);
    let saveFailed = false;
    try {
      await saveSubmission(record, rows);
    } catch (e) {
      console.error('submission save failed', e);
      saveFailed = true;
    }
    setView({ name: 'result', record, saveFailed });
  }, []);

  if (questionSets.length === 0) {
    return <main className="app-empty">src/data/sets 에 문항 세트(JSON)가 없습니다.</main>;
  }
  if (draft === undefined || settings === null) return null; // IndexedDB 로딩 (수 ms)

  const subject = settings.subject;
  const home = () => setView({ name: 'home' });

  if (view.name === 'exam' && draft) {
    return (
      <ExamScreen
        set={setOf(draft)!}
        attempt={draft}
        onChange={setDraft}
        onExit={(final) => {
          setDraft(final);
          home();
        }}
        onSubmit={submit}
        calculator={settings.examCalculator && subjectOf(draft) === '경제학원론'}
      />
    );
  }

  if (view.name === 'result') {
    const { record } = view;
    return (
      <ResultScreen
        set={setOf(record)!}
        record={record}
        saveFailed={view.saveFailed}
        onReview={(o) => setView({ name: 'review', record, ...o })}
        onHome={home}
      />
    );
  }

  if (view.name === 'review') {
    const { record } = view;
    return (
      <ReviewScreen
        set={setOf(record)!}
        record={record}
        startNumber={view.number}
        wrongOnly={view.wrongOnly}
        onBack={() => setView({ name: 'result', record })}
      />
    );
  }

  if (view.name === 'notes') {
    return (
      <NotesScreen
        subject={subject}
        onPractice={(questionIds) => setView({ name: 'practice', questionIds, from: 'notes' })}
        onHome={home}
      />
    );
  }

  if (view.name === 'practice') {
    return view.from === 'home' ? (
      <PracticeScreen questionIds={view.questionIds} title={view.title} backLabel="홈" onDone={home} />
    ) : (
      <PracticeScreen questionIds={view.questionIds} onDone={() => setView({ name: 'notes' })} />
    );
  }

  if (view.name === 'stats') return <StatsScreen subject={subject} onHome={home} />;
  if (view.name === 'cards') return <CardsScreen onHome={home} />;
  if (view.name === 'shift-quiz') return <ShiftQuizScreen onHome={home} />;

  if (view.name === 'cite-search') {
    return (
      <CiteSearchScreen
        query={citeQuery}
        onQuery={setCiteQuery}
        onOpen={(questionIds, start) => setView({ name: 'browse', questionIds, start })}
        onBack={() => setView({ name: 'settings' })}
      />
    );
  }

  if (view.name === 'browse') {
    return <BrowseScreen questionIds={view.questionIds} start={view.start} onBack={() => setView({ name: 'cite-search' })} />;
  }

  if (view.name === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onChange={updateSettings}
        onHome={home}
        onCiteSearch={() => setView({ name: 'cite-search' })}
      />
    );
  }

  const mode = settings.instantExplanation ? 'practice' : 'exam';
  return (
    <HomeScreen
      sets={setsOf(subject)}
      subject={subject}
      draft={draft}
      settings={settings}
      onSubject={(s) => updateSettings({ subject: s })}
      onStart={(setId) => {
        const set = findSet(setId)!;
        setDraft(
          newAttempt(setId, timeLimitSec(set.questions.length, settings.timeLimitMinutes), Date.now(), mode, undefined, set.subject),
        );
        setView({ name: 'exam' });
      }}
      onStartMix={async () => {
        // 맞춤 모의고사: 이 과목의 시드 제외 전체 문항에서 blueprint 배분(±jitter) + 약점 분류 가중치
        const [attempts, { rows, history }] = await Promise.all([db.attempts.toArray(), questionHistory()]);
        const examIds = new Set(attempts.filter((a) => a.mode !== 'practice' && subjectOf(a) === subject).map((a) => a.id));
        const weak = settings.weakUnitBoost
          ? weakCategories(
              rows.filter((r) => examIds.has(r.attemptId)),
              subject,
            ).map((u) => u.key)
          : [];
        const pool = setsOf(subject)
          .filter((s) => !isSeedSet(s.id))
          .flatMap((s) => s.questions);
        const ids = buildMix({ pool, blueprint: blueprints[subject], weakUnits: weak, history });
        const now = Date.now();
        setDraft(newAttempt(`${MIX_PREFIX}${now}`, timeLimitSec(ids.length, settings.timeLimitMinutes), now, mode, ids, subject));
        setView({ name: 'exam' });
      }}
      onWeakDrill={async (category: Category) => {
        const [notes, { history }] = await Promise.all([db.notes.toArray(), questionHistory()]);
        const now = Date.now();
        const dueIds = new Set(notes.filter((n) => isDue(n, now)).map((n) => n.questionId));
        const pool = setsOf(subject).flatMap((s) => s.questions);
        const ids = buildWeakDrill(pool, category, { dueIds, history });
        if (ids.length) setView({ name: 'practice', questionIds: ids, from: 'home', title: `약점 복습 · ${category}` });
      }}
      onCards={() => setView({ name: 'cards' })}
      onShiftQuiz={() => setView({ name: 'shift-quiz' })}
      onCalcDrill={async () => {
        const [notes, { history }] = await Promise.all([db.notes.toArray(), questionHistory()]);
        const now = Date.now();
        const dueIds = new Set(notes.filter((n) => isDue(n, now)).map((n) => n.questionId));
        const pool = setsOf(subject).flatMap((s) => s.questions);
        const ids = buildDrill(pool, isCalc, { dueIds, history });
        if (ids.length) setView({ name: 'practice', questionIds: ids, from: 'home', title: '계산 문제' });
      }}
      onSettings={() => setView({ name: 'settings' })}
      onResume={() => setView({ name: 'exam' })}
      onNotes={() => setView({ name: 'notes' })}
      onStats={() => setView({ name: 'stats' })}
      onOpenRecord={async (id) => {
        const record = await db.attempts.get(id);
        if (record && setOf(record)) setView({ name: 'result', record });
      }}
    />
  );
}
