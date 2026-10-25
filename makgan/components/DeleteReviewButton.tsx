"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReview } from "@/lib/actions/reviews";
import { toast } from "./Toast";

export default function DeleteReviewButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        className="btn btn-text"
        disabled={pending}
        onClick={() => {
          if (!confirm("이 후기를 삭제할까요?")) return;
          start(async () => {
            const r = await deleteReview(id);
            if (r.error) setError(r.error);
            else { toast("후기를 삭제했어요"); router.refresh(); }
          });
        }}
      >
        삭제
      </button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
