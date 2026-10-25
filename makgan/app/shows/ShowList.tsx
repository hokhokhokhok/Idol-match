"use client";
import { useState, useTransition } from "react";
import ShowCard from "@/components/ShowCard";
import { loadMoreShows } from "@/lib/actions/shows";
import type { ShowSummary } from "@/lib/types";

export default function ShowList({ initial, nextCursor, query }: { initial: ShowSummary[]; nextCursor: number | null; query: Record<string, string> }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const more = () =>
    start(async () => {
      try {
        const r = await loadMoreShows(query, cursor!);
        setItems((prev) => [...prev, ...r.items.filter((s) => !prev.some((p) => p.id === s.id))]);
        setCursor(r.nextCursor);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });

  return (
    <>
      <ul className="card-list">
        {items.map((s) => <li key={s.id}><ShowCard show={s} /></li>)}
      </ul>
      {failed && <p className="form-error" role="alert">불러오지 못했어요. 다시 눌러 주세요.</p>}
      {cursor !== null && (
        <button className="btn btn-block" onClick={more} disabled={pending}>{pending ? "불러오는 중…" : "더 보기"}</button>
      )}
    </>
  );
}
