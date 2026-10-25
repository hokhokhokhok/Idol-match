"use client";
import { useState, useTransition } from "react";
import { adminRunKopisSync } from "@/lib/actions/admin";
import type { SyncResult } from "@/lib/kopis-sync";

/** KOPIS 공식 데이터 가져오기. 매일 자동으로도 돌고, 여기서는 바로 실행한다. */
export default function KopisSync() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ result?: SyncResult; error?: string } | null>(null);
  const run = () => start(async () => setRes(await adminRunKopisSync()));
  const r = res?.result;
  return (
    <section className="section" aria-labelledby="kopis-title">
      <h3 className="section-title" id="kopis-title">공연 정보 가져오기</h3>
      <p className="form-hint">공연예술통합전산망(KOPIS)의 뮤지컬·연극(공연 중·예정, 향후 4개월)을 가져와요. 매일 새벽에 자동으로도 갱신돼요.</p>
      <button type="button" className="btn btn-block" onClick={run} disabled={pending} data-pending={pending || undefined}>{pending ? "가져오는 중… (1분쯤 걸려요)" : "KOPIS에서 지금 가져오기"}</button>
      {res?.error && <p className="form-error" role="alert">{res.error}</p>}
      {r && (
        <p className="form-hint" role="status" data-testid="kopis-result">
          목록 {r.listed}편 · 새 공연 {r.created} · 갱신 {r.updated} · 상세 {r.detailed} · 극장 {r.theaters} · 배우 {r.actors}
          {r.pendingDetails > 0 || r.partial ? ` · 아직 ${r.pendingDetails}편 남음 — 한 번 더 눌러 주세요` : " · 모두 최신이에요"}
          {r.errors.length > 0 && ` · 오류 ${r.errors.length}건(${r.errors[0]})`}
        </p>
      )}
    </section>
  );
}
