"use server";
import { GROUP_PAGE_SIZE, listActorGroup, type GroupPage } from "@/lib/data/actors";
import { isInitial } from "@/lib/initials";
import { isTier } from "@/lib/popularity";

/** 배우 목록 묶음 열기/더 보기(클라이언트에서 호출). 입력은 모두 서버에서 다시 검사한다. */
export async function loadActorGroup(initial: string, offset: number, tier?: string): Promise<GroupPage | { error: string }> {
  if (!isInitial(initial) || !Number.isInteger(offset) || offset < 0 || offset > 20000) return { error: "불러올 수 없어요" };
  if (tier !== undefined && !isTier(tier)) return { error: "불러올 수 없어요" };
  try {
    return await listActorGroup(initial, offset, tier, GROUP_PAGE_SIZE);
  } catch {
    return { error: "불러오지 못했어요. 다시 시도해 주세요" };
  }
}
