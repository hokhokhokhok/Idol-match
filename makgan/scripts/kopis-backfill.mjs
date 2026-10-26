// 배우 필모그래피용: 지난 공연(공연완료)을 월 단위로 거슬러 가져온다. 이미 있는 공연은 건너뛴다.
//   KOPIS_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   node scripts/kopis-backfill.mjs [몇 개월 전부터(기본 24)] [몇 개월 전까지(기본 0)]
import { createClient } from "@supabase/supabase-js";
import { syncKopis } from "../lib/kopis-sync.ts";

const { KOPIS_SERVICE_KEY: key, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!key || !url || !service) { console.error("KOPIS_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다."); process.exit(1); }
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const start = Number(process.argv[2] ?? 24);
const end = Number(process.argv[3] ?? 0);
const today = new Date(Date.now() + 9 * 3600e3);
const first = (back) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
const day = (d) => d.toISOString().slice(0, 10);
const t0 = Date.now();
for (let back = start; back > end; back--) {
  const fromDay = day(first(back));
  const toDay = day(new Date(first(back - 1).getTime() - 86400e3));
  const r = await syncKopis(db, { key, baseUrl: process.env.KOPIS_BASE_URL || undefined, fromDay, toDay, states: ["03"], staleDays: 36500, concurrency: Number(process.env.KOPIS_CONCURRENCY) || 3 });
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${fromDay}~${toDay}: 목록 ${r.listed}, 새 공연 ${r.created}, 출연 ${r.castsAdded}, 오류 ${r.errors.length}${r.errors[0] ? ` (${r.errors[0]})` : ""}`);
}
process.exit(0);
