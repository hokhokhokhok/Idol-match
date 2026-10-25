"use server";
import { listShows } from "@/lib/data/shows";
import { parseShowParams } from "@/lib/show-params";

/** 공연 목록 "더 보기" — 클라이언트가 보낸 값은 다시 검증한다 */
export async function loadMoreShows(query: Record<string, string>, cursor: number) {
  return listShows({ ...parseShowParams(query), cursor: Number.isInteger(cursor) && cursor > 0 ? cursor : 0 });
}
