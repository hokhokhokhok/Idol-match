"use client";
import PageHeader from "@/components/PageHeader";

/** 예상 못 한 오류(네트워크 등): "불러오지 못했어요 · 다시 시도"(SPEC-2 A-2) */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PageHeader title="막간" />
      <main className="page-body">
        <div className="empty" role="alert">
          <div className="empty-icon" aria-hidden="true">⚠️</div>
          <p>불러오지 못했어요</p>
          <button className="btn btn-primary" onClick={reset}>다시 시도</button>
        </div>
      </main>
    </>
  );
}
