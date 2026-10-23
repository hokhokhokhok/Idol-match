import { useCallback, useState } from 'react';
import { loadDraft, newAttempt, saveDraft, type Attempt } from './lib/attempt';
import { timeLimitSec } from './lib/config';
import { useFontSize } from './lib/prefs';
import { questionSets } from './lib/sets';
import { ExamScreen } from './screens/ExamScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ResultScreen } from './screens/ResultScreen';

type View = { name: 'home' } | { name: 'exam' } | { name: 'result'; attempt: Attempt };

const findSet = (id: string) => questionSets.find((s) => s.id === id);

export function App() {
  const [fontSize, setFontSize] = useFontSize();
  const [draft, setDraftState] = useState<Attempt | null>(() => {
    const d = loadDraft();
    return d && findSet(d.setId) ? d : null;
  });
  const [view, setView] = useState<View>({ name: 'home' });

  const setDraft = useCallback((a: Attempt | null) => {
    setDraftState(a);
    saveDraft(a);
  }, []);

  if (questionSets.length === 0) {
    return <main className="app-empty">src/data/sets 에 문항 세트(JSON)가 없습니다.</main>;
  }

  if (view.name === 'exam' && draft) {
    const set = findSet(draft.setId)!;
    return (
      <ExamScreen
        set={set}
        attempt={draft}
        onChange={setDraft}
        onExit={() => setView({ name: 'home' })}
        onSubmit={(timeUp) => {
          const done: Attempt = { ...draft, submittedAt: Date.now(), timeUp };
          setDraft(null);
          setView({ name: 'result', attempt: done });
        }}
      />
    );
  }

  if (view.name === 'result') {
    return (
      <ResultScreen set={findSet(view.attempt.setId)!} attempt={view.attempt} onHome={() => setView({ name: 'home' })} />
    );
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
    />
  );
}
