import { useCallback, useEffect, useState } from 'react';
import { newAttempt, type Attempt } from './lib/attempt';
import { timeLimitSec } from './lib/config';
import { db, loadDraft, saveDraft, saveSubmission, type AttemptRecord } from './lib/db';
import { buildSubmission } from './lib/records';
import blueprint from '../config/blueprint.json';
import { buildMix } from './lib/plan';
import { isSeedSet, MIX_PREFIX, questionById, questionSets, resolveSet } from './lib/sets';
import { weakUnits } from './lib/stats';
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
/** 맞춤 세트·고정 세트 공통: 응시(또는 기록)가 가리키는 세트 */
const setOf = (a: { setId: string; questionIds?: string[] }) => resolveSet(a);

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
        set={setOf(draft)!}
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
        set={setOf(record)!}
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
      onStartMix={async () => {
        // 맞춤 모의고사: 시드 세트를 뺀 전체 문항에서 blueprint 배분(±2 변동) + 약점 단원 가중치
        const [attempts, rows] = await Promise.all([db.attempts.toArray(), db.results.toArray()]);
        const examIds = new Set(attempts.filter((a) => a.mode !== 'practice').map((a) => a.id));
        const history = new Map<string, { seen: number; wrong: number }>();
        for (const r of rows) {
          const h = history.get(r.questionId) ?? { seen: 0, wrong: 0 };
          h.seen += 1;
          if (!r.correct) h.wrong += 1;
          history.set(r.questionId, h);
        }
        const inScope = rows.filter((r) => examIds.has(r.attemptId) && questionById.has(r.questionId));
        const weak = settings.weakUnitBoost ? weakUnits(inScope).map((u) => u.key) : [];
        const pool = questionSets.filter((s) => !isSeedSet(s.id)).flatMap((s) => s.questions);
        const ids = buildMix({ pool, blueprint, weakUnits: weak, history });
        const now = Date.now();
        const mode = settings.instantExplanation ? 'practice' : 'exam';
        setDraft(newAttempt(`${MIX_PREFIX}${now}`, timeLimitSec(ids.length, settings.timeLimitMinutes), now, mode, ids));
        setView({ name: 'exam' });
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
