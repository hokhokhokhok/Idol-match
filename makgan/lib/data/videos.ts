import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DataError, isUuid } from "./shows";

export type Video = { id: string; youtube_id: string; title: string; published_on: string | null };

/** 공연 또는 배우의 영상(최근 공개일순) */
export async function listVideos(by: { showId?: string; actorId?: string }, limit = 20): Promise<Video[]> {
  const id = by.showId ?? by.actorId;
  if (!isSupabaseConfigured || !isUuid(id)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("videos").select("id, youtube_id, title, published_on")
    .eq(by.showId ? "show_id" : "actor_id", id)
    .order("published_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new DataError(error.message);
  return data ?? [];
}
