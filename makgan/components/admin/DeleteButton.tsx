"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** 확인 후 삭제(관리자 목록·캐스팅) */
export default function DeleteButton({ action, label = "삭제", confirmText }: { action: () => Promise<{ error?: string }>; label?: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        type="button" className="btn btn-text btn-danger" disabled={pending}
        onClick={() => {
          if (!confirm(confirmText)) return;
          start(async () => {
            const r = await action();
            if (r.error) setError(r.error);
            else router.refresh();
          });
        }}
      >{label}</button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
