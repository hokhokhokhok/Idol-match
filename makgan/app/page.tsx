import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function HomePage() {
  return (
    <>
      <PageHeader title="막간" />
      <main className="page-body">
        {!isSupabaseConfigured && (
          <p className="notice">Supabase 연결 전이에요. README의 “Supabase 연결”을 따라 .env.local을 만들어 주세요.</p>
        )}
        <Placeholder icon="🎭" title="오늘 마감 · 곧 열리는 티켓 · 내 찜 공연" step={7} />
      </main>
    </>
  );
}
