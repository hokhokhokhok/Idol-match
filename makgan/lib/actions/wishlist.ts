"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/shows";
import type { ToggleResult } from "@/lib/types";

/** 찜 토글(SPEC-2 A-6 toggleWishlist). 비로그인이면 needLogin. */
export async function toggleWishlist(showId: string): Promise<ToggleResult> {
  if (!isUuid(showId)) return { error: "잘못된 요청이에요" };
  const user = await getUser();
  if (!user) return { needLogin: true };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("wishlists").select("show_id").eq("show_id", showId).maybeSingle();
  const { error } = existing
    ? await supabase.from("wishlists").delete().eq("user_id", user.id).eq("show_id", showId)
    : await supabase.from("wishlists").insert({ user_id: user.id, show_id: showId });
  if (error) return { error: "저장하지 못했어요" };

  revalidatePath("/", "layout");
  return { on: !existing };
}
