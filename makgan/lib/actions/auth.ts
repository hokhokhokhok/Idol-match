"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUser, safeNext } from "@/lib/auth";

export type FormState = { ok?: boolean; error?: string; email?: string; nickname?: string };

const NEXT_COOKIE = "mg_next";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendMagicLink(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "이메일 주소를 확인해 주세요", email };
  if (!isSupabaseConfigured) return { error: "Supabase 연결 전이라 로그인할 수 없어요", email };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
  // 메일 링크를 다른 브라우저(메일 앱 내장 브라우저 등)에서 열어도 되도록 token_hash 방식을 쓰고,
  // 돌아갈 경로는 쿠키에 둔다(같은 브라우저면 그대로, 아니면 홈).
  (await cookies()).set(NEXT_COOKIE, safeNext(formData.get("next")), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/confirm` } });
  if (error) {
    return { error: error.status === 429 ? "잠시 후 다시 시도해 주세요" : "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요", email };
  }
  return { ok: true, email };
}

/** 로그인 링크 확인 후 돌아갈 곳. 쿠키는 한 번 쓰고 지운다. */
export async function takeNextPath() {
  const store = await cookies();
  const next = safeNext(store.get(NEXT_COOKIE)?.value);
  store.delete(NEXT_COOKIE);
  return next;
}

export async function saveNickname(_: FormState, formData: FormData): Promise<FormState> {
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (nickname.length < 1 || nickname.length > 20) return { error: "닉네임은 1~20자로 입력해 주세요", nickname };
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ nickname }).eq("id", user.id);
  if (error) return { error: error.code === "23505" ? "이미 쓰는 닉네임이에요" : "저장하지 못했어요. 다시 시도해 주세요", nickname };
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
