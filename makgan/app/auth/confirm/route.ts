import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { takeNextPath } from "@/lib/actions/auth";

/**
 * 매직링크 도착 지점 → 닉네임 없으면 닉네임 화면, 있으면 원래 가려던 곳.
 * - token_hash: 우리 메일 템플릿(supabase/templates) — 다른 브라우저에서 열어도 됨
 * - code: Supabase 기본 메일 템플릿(PKCE). 무료 플랜 기본 메일 발송은 템플릿을 못 바꾸므로 이 경로를 쓴다(같은 브라우저에서 열어야 함)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!tokenHash && !code) return to("/login?error=link");

  const supabase = await createClient();
  let user: User | null = null;
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) user = data.user;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  }
  if (!user) return to("/login?error=link");

  const next = await takeNextPath();
  const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", user.id).single();
  return to(profile?.nickname ? next : `/onboarding?next=${encodeURIComponent(next)}`);
}
