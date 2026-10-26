import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncKopis } from "@/lib/kopis-sync";
import { refreshNewsSignals } from "@/lib/naver-news";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 매일 한 번(Vercel Cron): KOPIS 공연 정보 갱신. Authorization: Bearer CRON_SECRET 로 보호 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.KOPIS_SERVICE_KEY;
  const supabase = createServiceClient();
  if (!key || !supabase) return NextResponse.json({ error: "KOPIS_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  const result = await syncKopis(supabase, { key, baseUrl: process.env.KOPIS_BASE_URL || undefined, timeBudgetMs: 240_000 });
  // 선택: 네이버 키가 있으면 배우별 뉴스 언급량도 갱신(인기 등급 재료). 실패해도 공연 가져오기 결과는 그대로.
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  const news = id && secret ? await refreshNewsSignals(supabase, { id, secret }).catch(() => null) : null;
  return NextResponse.json({ ...result, news });
}

export const GET = handle;
export const POST = handle;
