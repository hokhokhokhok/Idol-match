"use client";
import { useActionState } from "react";
import type { AdminFormState } from "@/lib/actions/admin";

export default function ZoneForm({ action }: { action: (s: AdminFormState, f: FormData) => Promise<AdminFormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = state.values ?? {};
  return (
    <form action={formAction} className="form cast-form" key={JSON.stringify(state)}>
      <div className="field-row">
        <label className="field">
          <span>층</span>
          <input name="floor" required maxLength={20} list="floor-options" defaultValue={v.floor ?? "1층"} />
          <datalist id="floor-options"><option value="1층" /><option value="2층" /><option value="3층" /></datalist>
        </label>
        <label className="field">
          <span>구역 이름</span>
          <input name="name" required maxLength={50} defaultValue={v.name ?? ""} placeholder="예: 가운데" />
        </label>
        <label className="field zone-sort">
          <span>정렬</span>
          <input name="sort_order" type="number" min={0} max={999} defaultValue={v.sort_order ?? "0"} />
        </label>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "추가 중…" : "구역 추가"}</button>
    </form>
  );
}
