// KOPIS 공연 정보 가져오기(첫 채우기·수동 실행). 환경 변수:
//   KOPIS_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   npm run import:kopis
import { createClient } from "@supabase/supabase-js";
import { syncKopis } from "../lib/kopis-sync.ts";

const { KOPIS_SERVICE_KEY: key, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
if (!key || !url || !service) {
  console.error("KOPIS_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const started = Date.now();
const r = await syncKopis(db, { key, baseUrl: process.env.KOPIS_BASE_URL || undefined, concurrency: Number(process.env.KOPIS_CONCURRENCY) || undefined, log: (m) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${m}`) });
console.log(JSON.stringify(r, null, 2));
process.exit(r.errors.length && !r.created && !r.updated ? 1 : 0);
