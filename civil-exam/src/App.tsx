import { useCallback, useEffect, useState } from 'react';
import { newAttempt, type Attempt } from './lib/attempt';
import { timeLimitSec } from './lib/config';
import { db, loadDraft, saveDraft, saveSubmission, type AttemptRecord } from './lib/db';
import { buildSubmission } from './lib/records';
import { questionSets } from './lib/sets';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './lib/settings';
import { ExamScreen } from './screens/ExamScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotesScreen } from './screens/NotesScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';

type View =
  | { name: 'home' }
  | { name: 'exam' }
  | { name: 'result'; record: AttemptRecord; saveFailed?: boolean }
  | { name: 'review'; record: AttemptRecord; number?: number; wrongOnly?: boolean }
  | { name: 'notes' }
  | { name: 'practice'; questionIds: string[] }
  | { name: 'stats' }
  | { name: 'settings' };

const findSet = (id: string) => questionSets.find((s) => s.id === id);

export function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [draft, setDraftState] = useState<Attempt | null | undefined>(undefined);
  const [view, setView] = useState<View>({ name: 'home' });

  useEffect(() => {
    loadSettings()
      .catch((e) => {
        console.error('settings load failed', e);
        return DEFAULT_SETTINGS;
      })
      .then(setSettingsState);
    loadDraft()
      .then((d) => setDraftState(d && findSet(d.setId) ? d : null))
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
  if (draft === undefined || settings === null) return null; // IndexedDB 로딩 (수 ms)

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

  if (view.name === 'settings') {
    return <SettingsScreen settings={settings} onChange={updateSettings} onHome={() => setView({ name: 'home' })} />;
  }

  return (
    <HomeScreen
      sets={questionSets}
      draft={draft}
      settings={settings}
      onStart={(setId) => {
        const set = findSet(setId)!;
        const mode = settings.instantExplanation ? 'practice' : 'exam';
        setDraft(newAttempt(setId, timeLimitSec(set.questions.length, settings.timeLimitMinutes), Date.now(), mode));
        setView({ name: 'exam' });
      }}
      onSettings={() => setView({ name: 'settings' })}
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
