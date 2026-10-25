"use client";
import { useActionState } from "react";
import type { AdminFormState } from "@/lib/actions/admin";
import type { Field } from "@/lib/admin-entities";
import Combobox from "@/components/Combobox";

type Option = { value: string; label: string };

/** 관리자 공용 폼: 필드 정의대로 그린다. 검증 실패 시 입력 유지. */
export default function EntityForm({
  action, fields, initial, optionSets, submitLabel, formId,
}: {
  action: (s: AdminFormState, f: FormData) => Promise<AdminFormState>;
  fields: readonly Field[];
  initial: Record<string, string>;
  optionSets: Record<string, Option[]>;
  submitLabel: string;
  formId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = { ...initial, ...state.values };
  return (
    <form action={formAction} className="form" id={formId} key={JSON.stringify(state.values ?? {})}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {fields.map((f) => {
        const options = Array.isArray(f.options) ? (f.options as Option[]) : f.options ? optionSets[f.options as string] ?? [] : [];
        return (
          <label key={f.name} className="field">
            <span>{f.label}{f.required && " *"}</span>
            {f.type === "textarea" ? (
              <textarea name={f.name} rows={4} maxLength={f.max} defaultValue={v[f.name] ?? ""} required={f.required} />
            ) : f.type === "select" && typeof f.options === "string" ? (
              <Combobox name={f.name} options={options} defaultValue={v[f.name]} required={f.required} placeholder={`${f.label.replace(/\(선택\)/, "").trim()} 이름을 입력해서 찾기${f.required ? "" : " (비워 둘 수 있어요)"}`} />
            ) : f.type === "select" ? (
              <select name={f.name} defaultValue={v[f.name] ?? ""} required={f.required}>
                <option value="">{f.required ? "골라 주세요" : "없음"}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                name={f.name}
                type={{ text: "text", url: "url", date: "date", datetime: "datetime-local", number: "number", youtube: "text" }[f.type]}
                maxLength={f.type === "text" || f.type === "url" ? f.max : undefined}
                max={f.type === "number" ? f.max : undefined}
                defaultValue={v[f.name] ?? ""}
                required={f.required}
              />
            )}
            {f.hint && <small className="form-hint">{f.hint}</small>}
          </label>
        );
      })}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "저장 중…" : submitLabel}</button>
    </form>
  );
}
