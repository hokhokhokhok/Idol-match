"use client";
import { useActionState } from "react";
import type { AdminFormState } from "@/lib/actions/admin";
import Combobox, { type Option } from "@/components/Combobox";

export default function CastForm({ action, actors, minDate, maxDate }: {
  action: (s: AdminFormState, f: FormData) => Promise<AdminFormState>;
  actors: Option[];
  minDate: string;
  maxDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  return (
    <form action={formAction} className="form cast-form" key={JSON.stringify(state)}>
      <div className="field-row">
        <label className="field">
          <span>배우</span>
          <Combobox name="actor_id" options={actors} defaultValue={v.actor_id} required placeholder="배우 이름 검색" />
        </label>
        <label className="field">
          <span>배역</span>
          <input name="role_name" required maxLength={100} defaultValue={v.role_name ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>날짜(비우면 시즌 캐스팅)</span>
        <input type="date" name="perf_date" min={minDate} max={maxDate} defaultValue={v.perf_date ?? ""} />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "추가 중…" : "캐스팅 추가"}</button>
    </form>
  );
}
