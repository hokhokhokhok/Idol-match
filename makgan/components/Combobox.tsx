"use client";
import { useId, useState } from "react";

export type Option = { value: string; label: string };

/**
 * 많은 항목(공연 961·배우 2000+) 중에서 글자로 검색해 고르는 입력칸. 목록에서 고른 이름만 인정하고,
 * 폼에는 고른 항목의 id가 name으로 전달된다.
 */
export default function Combobox({
  name, options, defaultValue, required, placeholder, onSelect, ariaLabel,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  onSelect?: (value: string) => void;
  ariaLabel?: string;
}) {
  const listId = useId();
  const initial = options.find((o) => o.value === defaultValue);
  const [text, setText] = useState(initial?.label ?? "");
  const [value, setValue] = useState(initial?.value ?? "");

  const change = (t: string, el: HTMLInputElement) => {
    setText(t);
    const hit = options.find((o) => o.label === t.trim());
    const next = hit?.value ?? "";
    setValue(next);
    onSelect?.(next);
    // 목록에 없는 글자는 제출을 막고 안내(비워 두는 것은 required에 맡김)
    el.setCustomValidity(t.trim() && !hit ? "목록에서 골라 주세요" : "");
  };

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <input
        type="search" value={text} onChange={(e) => change(e.target.value, e.target)} list={listId} data-combo={name}
        required={required} placeholder={placeholder ?? "이름을 입력해서 찾기"} autoComplete="off" aria-label={ariaLabel}
      />
      <datalist id={listId} data-combo-list={name}>
        {options.map((o) => <option key={o.value} value={o.label} />)}
      </datalist>
    </>
  );
}
