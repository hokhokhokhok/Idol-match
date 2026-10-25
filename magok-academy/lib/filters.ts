// 홈 화면 필터. 같은 그룹 안은 OR, 그룹 사이는 AND.
// 수강료·시간 정보가 없는 학원은 해당 필터가 켜지면 제외하되, "정보 없음"으로 따로 센다(추측해서 넣지 않는다).

import { AREAS, CATEGORIES, GRADES, WEEKDAYS, type Academy, type Area, type Category, type Grade, type ScheduleSlot, type Weekday } from "./types.ts";

export const TUITION_BANDS = [
  { id: "lt15", label: "15만원 미만", min: 0, max: 149_999 },
  { id: "15to20", label: "15~20만원", min: 150_000, max: 200_000 },
  { id: "gt20", label: "20만원 초과", min: 200_001, max: Number.POSITIVE_INFINITY },
] as const;
export type TuitionBand = (typeof TUITION_BANDS)[number]["id"];

/** 수업 시작 시각 기준 */
export const TIME_BANDS = [
  { id: "afternoon", label: "방과후 (17시 전)", from: "00:00", to: "16:59" },
  { id: "evening", label: "저녁 (17시 이후)", from: "17:00", to: "23:59" },
] as const;
export type TimeBand = (typeof TIME_BANDS)[number]["id"];

/** 주소에서 동네를 찾는다: "…(화곡동 340-7)" → "화곡". 못 찾으면 null */
export function areaOf(address: string | null): Area | null {
  const m = address?.match(/(마곡|화곡|내발산|외발산|가양)동/);
  if (!m) return null;
  return m[1].endsWith("발산") ? "발산" : (m[1] as Area);
}

export interface Filters {
  areas: Area[];
  categories: Category[];
  grades: Grade[];
  tuition: TuitionBand | null;
  days: Weekday[];
  times: TimeBand[];
  favoritesOnly: boolean;
}

export const EMPTY_FILTERS: Filters = { areas: [], categories: [], grades: [], tuition: null, days: [], times: [], favoritesOnly: false };

export function activeFilterCount(f: Filters): number {
  return f.areas.length + f.categories.length + f.grades.length + (f.tuition ? 1 : 0) + f.days.length + f.times.length + (f.favoritesOnly ? 1 : 0);
}

function slotMatches(slot: ScheduleSlot, f: Filters): boolean {
  if (f.days.length && !f.days.includes(slot.day)) return false;
  if (f.times.length) {
    return TIME_BANDS.some((b) => f.times.includes(b.id) && slot.start >= b.from && slot.start <= b.to);
  }
  return true;
}

export interface FilterResult {
  academies: Academy[];
  /** 다른 조건은 맞지만 정보가 없어 제외된 학원 수 */
  unknown: { tuition: number; schedule: number };
}

export function applyFilters(academies: Academy[], f: Filters, favorites: readonly string[] = []): FilterResult {
  const unknown = { tuition: 0, schedule: 0 };
  const band = TUITION_BANDS.find((b) => b.id === f.tuition);
  const wantsSchedule = f.days.length > 0 || f.times.length > 0;

  const result = academies.filter((a) => {
    if (f.favoritesOnly && !favorites.includes(a.id)) return false;
    if (f.areas.length) {
      const area = areaOf(a.address);
      if (!area || !f.areas.includes(area)) return false;
    }
    if (f.categories.length && !a.categories.some((c) => f.categories.includes(c))) return false;
    if (f.grades.length && !a.target_grades.some((g) => f.grades.includes(g))) return false;

    let missing: "tuition" | "schedule" | null = null;
    if (band) {
      if (a.tuition_monthly_min === null) missing = "tuition";
      else if (!(a.tuition_monthly_min <= band.max && (a.tuition_monthly_max ?? a.tuition_monthly_min) >= band.min)) return false;
    }
    if (wantsSchedule) {
      if (a.schedule_slots.length === 0) missing ??= "schedule";
      else if (!a.schedule_slots.some((s) => slotMatches(s, f))) return false;
    }
    if (missing) {
      unknown[missing]++;
      return false;
    }
    return true;
  });
  return { academies: result, unknown };
}

// ── URL 쿼리 ⇄ 필터 (공유 가능한 링크) ──

const pick = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
  (raw ?? "").split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));

export function filtersFromParams(params: URLSearchParams): Filters {
  const tuition = params.get("t");
  return {
    areas: pick(params.get("a"), AREAS),
    categories: pick(params.get("c"), CATEGORIES),
    grades: pick(params.get("g"), GRADES),
    tuition: TUITION_BANDS.some((b) => b.id === tuition) ? (tuition as TuitionBand) : null,
    days: pick(params.get("d"), WEEKDAYS),
    times: pick(params.get("h"), TIME_BANDS.map((b) => b.id)),
    favoritesOnly: params.get("fav") === "1",
  };
}

export function filtersToParams(f: Filters, base = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  set("a", f.areas.join(","));
  set("c", f.categories.join(","));
  set("g", f.grades.join(","));
  set("t", f.tuition ?? "");
  set("d", f.days.join(","));
  set("h", f.times.join(","));
  set("fav", f.favoritesOnly ? "1" : "");
  return p;
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
