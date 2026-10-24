"use client";
import { useActionState } from "react";
import { saveNickname, type FormState } from "@/lib/actions/auth";

export default function NicknameForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNickname, {});
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>닉네임</span>
        <input name="nickname" required maxLength={20} autoComplete="nickname" placeholder="1~20자" defaultValue={state.nickname} />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "저장 중…" : "시작하기"}</button>
      <p className="form-hint">공개 후기에 작성자로 표시돼요. 나중에 바꿀 수 있어요.</p>
    </form>
  );
}
