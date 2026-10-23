import { useCallback, useEffect, useState } from 'react';
import { newAttempt, type Attempt } from './lib/attempt';
import { timeLimitSec } from './lib/config';
import { db, loadDraft, saveDraft, saveSubmission, type AttemptRecord } from './lib/db';
import { useFontSize } from './lib/prefs';
import { buildSubmission } from './lib/records';
import { questionSets } from './lib/sets';
import { ExamScreen } from './screens/ExamScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotesScreen } from './screens/NotesScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { StatsScreen } from './screens/StatsScreen';

type View =
  | { name: 'home' }
  | { name: 'exam' }
  | { name: 'result'; record: AttemptRecord; saveFailed?: boolean }
  | { name: 'review'; record: AttemptRecord; number?: number; wrongOnly?: boolean }
  | { name: 'notes' }
  | { name: 'practice'; questionIds: string[] }
  | { name: 'stats' };

const findSet = (id: string) => questionSets.find((s) => s.id === id);

export function App() {
  const [fontSize, setFontSize] = useFontSize();
  const [draft, setDraftState] = useState<Attempt | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: 'home' });

  useEffect(() => {
    loadDraft()
      .then((d) => setDraftState(d && findSet(d.setId) ? d : null))
      .catch((e) => {
        console.error('draft load failed', e);
        setDraftState(null);
      });
  }, []);

  const setDraft = useCallback((a: Attempt | null) => {
    setDraftState(a);
    saveDraft(a).catch((e) => console.error('draft save failed', e));
  }, []);

  const submit = useCallback(async (final: Attempt, timeUp: boolean) => {
    const set = findSet(final.setId)!;
    const { record, rows } = buildSubmission(set.questions, { ...final, timeUp });
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
  if (draft === undefined) return null; // IndexedDB 로딩 (수 ms)

  if (view.name === 'exam' && draft) {
    return (
      <ExamScreen
        set={findSet(draft.setId)!}
        attempt={draft}
        onChange={setDraft}
        onExit={(final) => {
          setDraft(final);
          setView({ name: 'home' });
        }}
        onSubmit={submit}
      />
    );
  }

  if (view.name === 'result') {
    const { record } = view;
    return (
      <ResultScreen
        set={findSet(record.setId)!}
        record={record}
        saveFailed={view.saveFailed}
        onReview={(o) => setView({ name: 'review', record, ...o })}
        onHome={() => setView({ name: 'home' })}
      />
    );
  }

  if (view.name === 'review') {
    const { record } = view;
    return (
      <ReviewScreen
        set={findSet(record.setId)!}
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
        onPractice={(questionIds) => setView({ name: 'practice', questionIds })}
        onHome={() => setView({ name: 'home' })}
      />
    );
  }

  if (view.name === 'practice') {
    return <PracticeScreen questionIds={view.questionIds} onDone={() => setView({ name: 'notes' })} />;
  }

  if (view.name === 'stats') {
    return <StatsScreen onHome={() => setView({ name: 'home' })} />;
  }

  return (
    <HomeScreen
      sets={questionSets}
      draft={draft}
      fontSize={fontSize}
      onFontSize={setFontSize}
      onStart={(setId) => {
        const set = findSet(setId)!;
        setDraft(newAttempt(setId, timeLimitSec(set.questions.length)));
        setView({ name: 'exam' });
      }}
      onResume={() => setView({ name: 'exam' })}
      onNotes={() => setView({ name: 'notes' })}
      onStats={() => setView({ name: 'stats' })}
      onOpenRecord={async (id) => {
        const record = await db.attempts.get(id);
        if (record && findSet(record.setId)) setView({ name: 'result', record });
      }}
    />
  );
}
