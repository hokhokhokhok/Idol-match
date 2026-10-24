import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { safeNext } from "./url";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";

export type Profile = { id: string; nickname: string | null; is_admin: boolean };

/** 로그인한 사용자(Auth 서버로 확인). 비로그인·Supabase 미연결이면 null. */
export const getUser = cache(async () => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, nickname, is_admin").eq("id", user.id).single();
  return data;
});

/** 로그인 + 닉네임까지 마친 사용자만 통과. 아니면 로그인/닉네임 화면으로. */
export async function requireProfile(next: string) {
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!profile.nickname) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return profile as Profile & { nickname: string };
}

export { safeNext } from "./url";
