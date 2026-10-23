import { useEffect, useRef } from 'react';
import type { Question } from '../types';

type Props = {
  open: boolean;
  unanswered: Question[];
  flagged: Question[];
  onJump: (number: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** 제출 전 확인: 미응답·별표 문항을 보여 주고 바로 이동할 수 있게 한다 */
export function SubmitDialog({ open, unanswered, flagged, onJump, onCancel, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const list = (qs: Question[]) => (
    <ul className="dlg-nums">
      {qs.map((q) => (
        <li key={q.id}>
          <button type="button" onClick={() => onJump(q.number)} aria-label={`${q.number}번 문항으로 이동`}>
            {q.number}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-labelledby="submit-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="submit-title">답안을 제출할까요?</h2>
      {unanswered.length > 0 ? (
        <section>
          <p className="dlg-warn">
            미응답 <strong>{unanswered.length}문항</strong>이 있습니다. 미응답 문항은 오답 처리됩니다.
          </p>
          {list(unanswered)}
        </section>
      ) : (
        <p>모든 문항에 답했습니다.</p>
      )}
      {flagged.length > 0 && (
        <section>
          <p>별표한 문항 {flagged.length}개</p>
          {list(flagged)}
        </section>
      )}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          계속 풀기
        </button>
        <button type="button" className="btn btn-primary" onClick={onSubmit}>
          제출
        </button>
      </div>
    </dialog>
  );
}
