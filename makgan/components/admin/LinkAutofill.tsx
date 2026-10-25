"use client";
import { useState, useTransition } from "react";
import { adminFetchLinkMeta } from "@/lib/actions/admin";

/** 혜택 폼 위 "링크로 채우기": 제목·출처 이름·출처 링크만 채운다(날짜는 항상 직접 입력) */
export default function LinkAutofill({ formId }: { formId: string }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const fill = () => start(async () => {
    setMsg(null);
    const r = await adminFetchLinkMeta(url);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const set = (name: string, value?: string) => {
      const el = form?.elements.namedItem(name) as HTMLInputElement | null;
      if (el && value) el.value = value;
    };
    set("source_url", r.sourceUrl ?? (/^https?:\/\//.test(url) ? url : undefined));
    if (r.error) return setMsg({ ok: false, text: r.error });
    set("title", r.title);
    set("source_name", r.sourceName);
    setMsg({ ok: true, text: "제목과 출처를 채웠어요. 날짜는 직접 입력해 주세요" });
  });

  return (
    <div className="autofill">
      <label className="field">
        <span>링크로 채우기</span>
        <div className="search-form">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="공지·예매 페이지 주소" aria-label="채울 링크" />
          <button type="button" className="btn" onClick={fill} disabled={pending || !url} data-pending={pending || undefined}>{pending ? "읽는 중…" : "채우기"}</button>
        </div>
      </label>
      {msg && <p className={msg.ok ? "form-hint" : "form-error"} role="status">{msg.text}</p>}
    </div>
  );
}
