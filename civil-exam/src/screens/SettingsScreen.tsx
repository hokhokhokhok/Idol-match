import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { backupFileName, exportBackup, restoreBackup, summarize, validateBackup, type BackupFile } from '../lib/backup';
import { examConfig } from '../lib/config';
import { db } from '../lib/db';
import { FONT_SIZES, TIME_MAX, TIME_MIN, TIME_STEP, type Settings } from '../lib/settings';

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onHome: () => void;
};

/** 내보내기: 공유 시트(아이패드: '파일에 저장')가 되면 그것을, 아니면 파일 다운로드 */
async function deliverFile(text: string, name: string) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // 공유 실패 시 다운로드로 대체
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function SettingsScreen({ settings, onChange, onHome }: Props) {
  const counts = useLiveQuery(async () => ({ attempts: await db.attempts.count(), notes: await db.notes.count() }), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dlgRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    if (pending && !d.open) d.showModal();
    if (!pending && d.open) d.close();
  }, [pending]);

  const doExport = async () => {
    setMessage(null);
    try {
      const backup = await exportBackup();
      await deliverFile(JSON.stringify(backup), backupFileName());
      onChange({ lastBackupAt: Date.now() });
      const s = summarize(backup.data);
      setMessage({ kind: 'ok', text: `백업 파일을 만들었습니다 (시험 기록 ${s.attempts}회, 오답노트 ${s.notes}문항).` });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage({ kind: 'error', text: `백업에 실패했습니다: ${(e as Error).message}` });
    }
  };

  const onPick = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setMessage(null);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await f.text());
      } catch {
        throw new Error('JSON 파일을 읽을 수 없습니다.');
      }
      setPending(validateBackup(json));
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  };

  const doRestore = async () => {
    if (!pending) return;
    try {
      await restoreBackup(pending);
      // 진행 중 응시·설정까지 바뀌므로 앱을 새로 띄운다
      window.location.reload();
    } catch (e) {
      setPending(null);
      setMessage({ kind: 'error', text: `복원에 실패했습니다. 기존 기록은 그대로입니다. (${(e as Error).message})` });
    }
  };

  const time = settings.timeLimitMinutes;
  const setTime = (m: number) => onChange({ timeLimitMinutes: Math.min(TIME_MAX, Math.max(TIME_MIN, m)) });
  const pendingSummary = pending && summarize(pending.data);

  return (
    <div className="result">
      <header className="topbar">
        <strong>설정</strong>
        <button type="button" className="btn" onClick={onHome}>
          홈으로
        </button>
      </header>

      <main className="home-main settings">
        <h2 className="section-title">시험지 글자 크기</h2>
        <section className="card set-row">
          <p className="font-preview">1. 통정허위표시에 관한 설명으로 옳은 것은?</p>
          <div className="seg seg-lg" role="radiogroup" aria-label="시험지 글자 크기">
            {FONT_SIZES.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === settings.fontSize}
                className={s === settings.fontSize ? 'is-on' : ''}
                onClick={() => onChange({ fontSize: s })}
              >
                {['작게', '보통', '크게'][i]} <span className="muted-inline">{s}</span>
              </button>
            ))}
          </div>
        </section>

        <h2 className="section-title">시험시간</h2>
        <section className="card set-row">
          <div>
            <p>
              40문항 기준 <strong>{time}분</strong>
            </p>
            <p className="muted small">
              문항 수가 다른 세트는 비례해서 정합니다. 기본값 {examConfig.defaultTimeLimitMinutes}분 — Q-Net 공고와 다르면
              바꾸세요. 진행 중인 시험에는 적용되지 않습니다.
            </p>
          </div>
          <div className="stepper" role="group" aria-label="시험시간">
            <button type="button" className="btn" onClick={() => setTime(time - TIME_STEP)} disabled={time <= TIME_MIN} aria-label={`${TIME_STEP}분 줄이기`}>
              −
            </button>
            <output aria-live="polite">{time}분</output>
            <button type="button" className="btn" onClick={() => setTime(time + TIME_STEP)} disabled={time >= TIME_MAX} aria-label={`${TIME_STEP}분 늘리기`}>
              +
            </button>
          </div>
        </section>

        <h2 className="section-title">풀이 방식</h2>
        <section className="card set-row">
          <div>
            <p id="instant-label">해설 즉시 보기 (연습 모드)</p>
            <p className="muted small">
              켜면 세트를 연습 모드로 시작합니다: 시간 제한 없이, 보기를 고르는 즉시 채점과 보기별 해설이 나옵니다. 끄면
              실전 모드(제한시간 안에 다 풀고 일괄 제출 후 해설)입니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.instantExplanation}
            aria-labelledby="instant-label"
            className="switch"
            onClick={() => onChange({ instantExplanation: !settings.instantExplanation })}
          >
            <span className="switch-knob" />
          </button>
        </section>

        <section className="card set-row">
          <div>
            <p id="weak-label">맞춤 모의고사 약점 단원 가중치</p>
            <p className="muted small">
              켜면 맞춤 세트를 만들 때 실전 정답률이 가장 낮은 단원(3문항 이상 푼 단원)에 2문항을 더 배정합니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.weakUnitBoost}
            aria-labelledby="weak-label"
            className="switch"
            onClick={() => onChange({ weakUnitBoost: !settings.weakUnitBoost })}
          >
            <span className="switch-knob" />
          </button>
        </section>

        <h2 className="section-title">데이터 백업 · 복원</h2>
        <section className="card data-card">
          <p>
            기록은 이 기기에만 저장됩니다. 시험 기록 {counts?.attempts ?? 0}회 · 오답노트 {counts?.notes ?? 0}문항
          </p>
          <p className="muted small">
            마지막 백업:{' '}
            {settings.lastBackupAt
              ? new Date(settings.lastBackupAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
              : '없음'}
            {persisted != null && ` · 저장공간 보호 ${persisted ? '켜짐' : '꺼짐 (홈 화면에 추가하면 켜질 수 있음)'}`}
          </p>
          <div className="data-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={doExport}>
              백업 파일 만들기
            </button>
            <button type="button" className="btn btn-lg" onClick={() => fileRef.current?.click()}>
              백업에서 복원…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onPick(e.target.files?.[0])}
            />
          </div>
          <p className="muted small">
            아이패드에서는 공유 시트의 '파일에 저장'으로 iCloud Drive 등에 보관하세요. 복원하면 이 기기의 기록이 백업
            내용으로 <strong>모두 바뀝니다</strong>.
          </p>
          {message && (
            <p className={`notice ${message.kind === 'error' ? 'notice-error' : 'notice-ok'}`} role="status">
              {message.text}
            </p>
          )}
        </section>
      </main>

      <dialog
        ref={dlgRef}
        className="dlg"
        aria-labelledby="restore-title"
        onCancel={(e) => {
          e.preventDefault();
          setPending(null);
        }}
      >
        <h2 id="restore-title">이 백업으로 복원할까요?</h2>
        {pending && pendingSummary && (
          <>
            <p>
              {pending.exportedAt &&
                `${new Date(pending.exportedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}에 만든 백업 · `}
              시험 기록 {pendingSummary.attempts}회, 오답노트 {pendingSummary.notes}문항, 복습 {pendingSummary.reviews}회
            </p>
            <p className="dlg-warn">
              현재 기기의 기록(시험 기록 {counts?.attempts ?? 0}회, 오답노트 {counts?.notes ?? 0}문항)은 <strong>삭제</strong>되고
              백업 내용으로 바뀝니다.
            </p>
          </>
        )}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={() => setPending(null)} autoFocus>
            취소
          </button>
          <button type="button" className="btn btn-danger" onClick={doRestore}>
            복원
          </button>
        </div>
      </dialog>
    </div>
  );
}
