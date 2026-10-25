"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient } from "@/lib/admin";
import { ADMIN_ENTITIES, isEntityKey, parseEntityForm } from "@/lib/admin-entities";
import { isDay, isUuid } from "@/lib/data/shows";

export type AdminFormState = { error?: string; values?: Record<string, string> };
const echo = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const DENIED = "관리자만 할 수 있어요";

/** 공연·배우·극장·혜택 저장(id가 있으면 수정). adminCreateBenefit 등을 하나로. */
export async function adminSave(entityKey: string, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  if (!isEntityKey(entityKey)) return { error: "잘못된 요청이에요" };
  const entity = ADMIN_ENTITIES[entityKey];
  const parsed = parseEntityForm(entity, form);
  if ("error" in parsed) return { error: parsed.error, values: echo(form) };

  const id = String(form.get("id") ?? "");
  const table = admin.supabase.from(entity.key);
  const { error } = id
    ? isUuid(id) ? await table.update(parsed.value).eq("id", id) : { error: { message: "bad id" } }
    : await table.insert(entity.key === "benefits" ? { ...parsed.value, created_by: admin.profile.id } : parsed.value);
  if (error) return { error: "저장하지 못했어요. 입력을 확인해 주세요", values: echo(form) };

  revalidatePath("/", "layout");
  redirect(`/admin/${entity.key}?toast=saved`);
}

export async function adminDelete(entityKey: string, id: string): Promise<{ error?: string }> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  if (!isEntityKey(entityKey) || !isUuid(id)) return { error: "잘못된 요청이에요" };
  const { data, error } = await admin.supabase.from(entityKey).delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "삭제하지 못했어요" };
  revalidatePath("/", "layout");
  return {};
}

/** 캐스팅 추가: 날짜를 비우면 시즌 캐스팅 */
export async function adminAddCast(showId: string, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  const actor_id = String(form.get("actor_id") ?? "");
  const role_name = String(form.get("role_name") ?? "").trim();
  const perf_date = String(form.get("perf_date") ?? "");
  if (!isUuid(showId) || !isUuid(actor_id)) return { error: "배우를 골라 주세요", values: echo(form) };
  if (!role_name || role_name.length > 100) return { error: "배역을 입력해 주세요(100자까지)", values: echo(form) };
  if (perf_date && !isDay(perf_date)) return { error: "날짜를 확인해 주세요", values: echo(form) };

  const { error } = await admin.supabase.from("casts").insert({ show_id: showId, actor_id, role_name, perf_date: perf_date || null });
  if (error) return { error: error.code === "23505" ? "이미 등록된 캐스팅이에요" : "저장하지 못했어요", values: echo(form) };
  revalidatePath("/", "layout");
  return {};
}

export async function adminDeleteCast(castId: string): Promise<{ error?: string }> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  if (!isUuid(castId)) return { error: "잘못된 요청이에요" };
  const { data, error } = await admin.supabase.from("casts").delete().eq("id", castId).select("id");
  if (error || !data?.length) return { error: "삭제하지 못했어요" };
  revalidatePath("/", "layout");
  return {};
}

/** 극장 구역 추가(층 + 구역 이름 + 정렬 순서). 실제 배치는 관리자가 확인한 것만 입력. */
export async function adminAddZone(theaterId: string, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  const floor = String(form.get("floor") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const sort = Number(form.get("sort_order") || 0);
  if (!isUuid(theaterId)) return { error: "잘못된 요청이에요" };
  if (!floor || floor.length > 20) return { error: "층을 입력해 주세요(20자까지)", values: echo(form) };
  if (!name || name.length > 50) return { error: "구역 이름을 입력해 주세요(50자까지)", values: echo(form) };
  if (!Number.isInteger(sort) || sort < 0 || sort > 999) return { error: "정렬 순서는 0~999", values: echo(form) };

  const { error } = await admin.supabase.from("seat_zones").insert({ theater_id: theaterId, floor, name, sort_order: sort });
  if (error) return { error: error.code === "23505" ? "같은 층에 같은 이름의 구역이 있어요" : "저장하지 못했어요", values: echo(form) };
  revalidatePath("/", "layout");
  return { values: { floor } };
}

export async function adminDeleteZone(zoneId: string): Promise<{ error?: string }> {
  const admin = await adminClient();
  if (!admin) return { error: DENIED };
  if (!isUuid(zoneId)) return { error: "잘못된 요청이에요" };
  const { data, error } = await admin.supabase.from("seat_zones").delete().eq("id", zoneId).select("id");
  if (error || !data?.length) return { error: "삭제하지 못했어요" };
  revalidatePath("/", "layout");
  return {};
}
