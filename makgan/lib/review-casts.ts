// "그날 캐스트" 입력(숨은 JSON) 검증 — 서버 액션·단위 테스트 공용
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_REVIEW_CASTS = 20;

export type CastPick = { actor_id: string; role_name: string; name?: string };

/** 잘못된 항목은 버리지 않고 오류로 돌려준다(조작된 요청). 같은 배우·배역 중복은 하나로. */
export function parseReviewCasts(raw: FormDataEntryValue | null): { value: CastPick[] } | { error: string } {
  if (raw === null || raw === "") return { value: [] };
  let list: unknown;
  try {
    list = JSON.parse(String(raw));
  } catch {
    return { error: "그날 캐스트를 다시 골라 주세요" };
  }
  if (!Array.isArray(list)) return { error: "그날 캐스트를 다시 골라 주세요" };
  const out: CastPick[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const actor_id = String((item as CastPick)?.actor_id ?? "");
    const role_name = String((item as CastPick)?.role_name ?? "").trim();
    if (!UUID_RE.test(actor_id) || !role_name || role_name.length > 100) return { error: "그날 캐스트를 다시 골라 주세요" };
    const key = `${actor_id}:${role_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ actor_id, role_name });
  }
  if (out.length > MAX_REVIEW_CASTS) return { error: `그날 캐스트는 ${MAX_REVIEW_CASTS}명까지예요` };
  return { value: out };
}
