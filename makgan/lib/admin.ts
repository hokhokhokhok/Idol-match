import "server-only";
import { redirect } from "next/navigation";
import { getProfile } from "./auth";
import { createClient } from "./supabase/server";

/** 관리자 페이지 입구: 관리자가 아니면 홈으로(SPEC-2 D). 레이아웃은 클라이언트 이동 때 다시 돌지 않으므로 페이지마다 부른다. */
export async function requireAdmin() {
  const profile = await getProfile();
  if (!profile?.is_admin) redirect("/");
  return profile;
}

/** 관리자 서버 액션 입구: 서버에서 is_admin을 다시 확인한다(SPEC-2 A-6). DB RLS도 관리자만 쓰기를 허용한다. */
export async function adminClient() {
  const profile = await getProfile();
  if (!profile?.is_admin) return null;
  return { supabase: await createClient(), profile };
}
