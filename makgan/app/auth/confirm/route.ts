import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { takeNextPath } from "@/lib/actions/auth";

/** 매직링크 도착 지점: token_hash 확인 → 닉네임 없으면 닉네임 화면, 있으면 원래 가려던 곳. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!tokenHash) return to("/login?error=link");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return to("/login?error=link");

  const next = await takeNextPath();
  const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", data.user.id).single();
  return to(profile?.nickname ? next : `/onboarding?next=${encodeURIComponent(next)}`);
}
