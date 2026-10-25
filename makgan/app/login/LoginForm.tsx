"use client";
import { useActionState } from "react";
import { sendMagicLink, type FormState } from "@/lib/actions/auth";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendMagicLink, {});

  if (state.ok) {
    return (
      <div className="empty" role="status">
        <div className="empty-icon" aria-hidden="true">📬</div>
        <p><strong>{state.email}</strong>으로 로그인 링크를 보냈어요.<br />메일의 링크를 누르면 로그인돼요.</p>
      </div>
    );
  }

  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>이메일</span>
        <input name="email" type="email" inputMode="email" autoComplete="email" required placeholder="you@example.com" defaultValue={state.email} />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "보내는 중…" : "로그인 링크 받기"}</button>
      <p className="form-hint">비밀번호 없이 메일로 받은 링크로 로그인해요. 처음이면 자동으로 가입돼요.</p>
    </form>
  );
}
