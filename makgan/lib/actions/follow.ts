"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/shows";
import type { ToggleResult } from "@/lib/types";


/** 팔로우 토글(SPEC-2 A-6 toggleFollow). 비로그인이면 needLogin. 권한은 RLS가 한 번 더 막는다. */
export async function toggleFollow(actorId: string): Promise<ToggleResult> {
  if (!isUuid(actorId)) return { error: "잘못된 요청이에요" };
  const user = await getUser();
  if (!user) return { needLogin: true };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("follows").select("actor_id").eq("actor_id", actorId).maybeSingle();
  const { error } = existing
    ? await supabase.from("follows").delete().eq("user_id", user.id).eq("actor_id", actorId)
    : await supabase.from("follows").insert({ user_id: user.id, actor_id: actorId });
  if (error) return { error: "저장하지 못했어요" };

  revalidatePath("/actors");
  revalidatePath(`/actors/${actorId}`);
  revalidatePath("/me");
  return { on: !existing };
}
