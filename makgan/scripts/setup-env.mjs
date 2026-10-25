// 배포용 비밀값 만들기: VAPID 키(푸시), CRON_SECRET. 출력된 줄을 Vercel 환경 변수에 넣는다.
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
console.log(`# ── 막간 배포 환경 변수 (아래 값은 지금 새로 만든 것) ──
# Supabase → Project Settings → API 에서 복사
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# 배포 주소(예: https://makgan.vercel.app)
NEXT_PUBLIC_SITE_URL=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=${randomBytes(24).toString("base64url")}
# 공연예술통합전산망(KOPIS) Open API 인증키(공연 정보 가져오기)
KOPIS_SERVICE_KEY=`);
