// CSV 한 행 → 타입이 붙은 레코드. 데이터 원칙(출처 필수, 미확인은 추측하지 않음 등)을 여기서 검사한다.
// error: 그 행을 앱에 싣지 않음 / warning: 싣되 점검 목록에 띄움

import { parseCsv, splitList } from "./csv.ts";
import {
  CAREER_TYPES,
  CATEGORIES,
  GRADES,
  ROLES,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  WEEKDAYS,
  type Academy,
  type CareerItem,
  type Person,
  type ScheduleSlot,
} from "./types.ts";

export type IssueLevel = "error" | "warning";
export interface Issue {
  level: IssueLevel;
  file: string;
  line: number;
  id?: string;
  field?: string;
  message: string;
}

export const ACADEMY_COLUMNS = [
  "id", "name", "categories", "target_grades", "address", "lat", "lng", "phone", "website",
  "instagram", "naver_place_url", "tuition_note", "schedule_note", "class_style",
  "performance_history", "opened_year", "description", "last_verified_at", "verification_status",
] as const;
/** 필터용 선택 컬럼. 없어도 읽힌다. */
export const ACADEMY_OPTIONAL_COLUMNS = ["tuition_monthly_min", "tuition_monthly_max", "schedule_slots", "source_urls"] as const;
export const PERSON_COLUMNS = [
  "id", "academy_id", "role", "name_public", "subjects", "profile_source_url", "disclosure_basis", "collected_at",
] as const;
export const CAREER_COLUMNS = [
  "id", "person_id", "type", "title", "organization", "year_from", "year_to", "source_url",
  "source_type", "collected_at", "verified",
] as const;

class RowReader {
  issues: Issue[] = [];
  private file: string;
  private line: number;
  private values: Record<string, string>;
  private id: string | undefined;
  constructor(file: string, line: number, values: Record<string, string>) {
    this.file = file;
    this.line = line;
    this.values = values;
    this.id = values.id || undefined;
  }
  report(level: IssueLevel, field: string | undefined, message: string) {
    this.issues.push({ level, file: this.file, line: this.line, id: this.id, field, message });
  }
  get hasError() {
    return this.issues.some((i) => i.level === "error");
  }
  raw(field: string): string {
    return this.values[field] ?? "";
  }
  opt(field: string): string | null {
    return this.raw(field) || null;
  }
  req(field: string): string {
    const v = this.raw(field);
    if (!v) this.report("error", field, "필수 값이 비어 있음");
    return v;
  }
  oneOf<T extends string>(field: string, allowed: readonly T[], fallback?: T): T {
    const v = this.raw(field);
    if (!v && fallback !== undefined) return fallback;
    if (!(allowed as readonly string[]).includes(v)) {
      this.report("error", field, `허용되지 않는 값 "${v}" (가능: ${allowed.join(", ")})`);
    }
    return v as T;
  }
  list<T extends string>(field: string, allowed: readonly T[], { required = false } = {}): T[] {
    const items = splitList(this.raw(field));
    if (required && items.length === 0) this.report("error", field, "최소 1개 필요");
    for (const it of items) {
      if (!(allowed as readonly string[]).includes(it)) {
        this.report("error", field, `허용되지 않는 값 "${it}" (가능: ${allowed.join(", ")})`);
      }
    }
    return items as T[];
  }
  num(field: string): number | null {
    const v = this.raw(field).replace(/,/g, "");
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      this.report("error", field, `숫자가 아님: "${this.raw(field)}"`);
      return null;
    }
    return n;
  }
  int(field: string): number | null {
    const n = this.num(field);
    if (n !== null && !Number.isInteger(n)) {
      this.report("error", field, `정수가 아님: "${this.raw(field)}"`);
      return null;
    }
    return n;
  }
  date(field: string, { required = false } = {}): string | null {
    const v = this.raw(field);
    if (!v) {
      if (required) this.report("error", field, "필수 날짜가 비어 있음 (YYYY-MM-DD)");
      return null;
    }
    if (!isIsoDate(v)) {
      this.report("error", field, `날짜 형식이 아님: "${v}" (YYYY-MM-DD)`);
      return null;
    }
    return v;
  }
  url(field: string, { required = false } = {}): string | null {
    const v = this.raw(field);
    if (!v) {
      if (required) this.report("error", field, "출처 URL이 비어 있음");
      return null;
    }
    if (!/^https?:\/\/\S+$/.test(v)) {
      this.report("error", field, `URL 형식이 아님: "${v}"`);
      return null;
    }
    return v;
  }
  urls(field: string): string[] {
    const items = splitList(this.raw(field));
    for (const it of items) {
      if (!/^https?:\/\/\S+$/.test(it)) this.report("error", field, `URL 형식이 아님: "${it}"`);
    }
    return items;
  }
  bool(field: string): boolean {
    const v = this.raw(field).toLowerCase();
    if (v === "true" || v === "1" || v === "y") return true;
    if (v === "false" || v === "0" || v === "n" || v === "") return false;
    this.report("error", field, `TRUE/FALSE가 아님: "${this.raw(field)}"`);
    return false;
  }
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "화 16:00-18:00;목 16:00-18:00" → ScheduleSlot[] */
export function parseScheduleSlots(value: string): { slots: ScheduleSlot[]; invalid: string[] } {
  const slots: ScheduleSlot[] = [];
  const invalid: string[] = [];
  for (const part of splitList(value)) {
    const m = /^([월화수목금토일])\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(part);
    if (!m || !isHhMm(m[2]) || !isHhMm(m[3]) || m[2] >= m[3]) {
      invalid.push(part);
      continue;
    }
    slots.push({ day: m[1] as ScheduleSlot["day"], start: m[2], end: m[3] });
  }
  return { slots, invalid };
}

function isHhMm(v: string): boolean {
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function checkHeader(file: string, header: string[], required: readonly string[], optional: readonly string[] = []): Issue[] {
  const issues: Issue[] = [];
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length) {
    issues.push({ level: "error", file, line: 1, message: `헤더에 컬럼이 없음: ${missing.join(", ")}` });
  }
  const known = new Set([...required, ...optional]);
  const unknown = header.filter((c) => c && !known.has(c));
  if (unknown.length) {
    issues.push({ level: "warning", file, line: 1, message: `알 수 없는 컬럼(무시됨): ${unknown.join(", ")}` });
  }
  return issues;
}

export interface ParseResult<T> {
  records: T[];
  issues: Issue[];
}

function parseTable<T>(
  file: string,
  text: string,
  required: readonly string[],
  optional: readonly string[],
  toRecord: (r: RowReader) => T,
): ParseResult<T> {
  const table = parseCsv(text);
  const issues = checkHeader(file, table.header, required, optional);
  if (issues.some((i) => i.level === "error")) return { records: [], issues };
  const records: T[] = [];
  for (const { line, values } of table.rows) {
    const r = new RowReader(file, line, values);
    const rec = toRecord(r);
    issues.push(...r.issues);
    if (!r.hasError) records.push(rec);
  }
  return { records, issues };
}

export function parseAcademies(text: string, file = "academies.csv"): ParseResult<Academy> {
  return parseTable(file, text, ACADEMY_COLUMNS, ACADEMY_OPTIONAL_COLUMNS, (r) => {
    const lat = r.num("lat");
    const lng = r.num("lng");
    if ((lat === null) !== (lng === null)) r.report("error", "lat", "lat/lng는 둘 다 있거나 둘 다 비어야 함");
    if (lat !== null && lng !== null && !(lat > 37.4 && lat < 37.7 && lng > 126.7 && lng < 127.2)) {
      r.report("warning", "lat", `좌표가 서울 범위를 벗어남 (${lat}, ${lng}) — 위도·경도가 뒤바뀌지 않았는지 확인`);
    }
    const min = r.int("tuition_monthly_min");
    const max = r.int("tuition_monthly_max");
    if (min !== null && max !== null && min > max) r.report("error", "tuition_monthly_min", "수강료 하한이 상한보다 큼");
    const { slots, invalid } = parseScheduleSlots(r.raw("schedule_slots"));
    if (invalid.length) {
      r.report("error", "schedule_slots", `형식 오류: ${invalid.join(", ")} (예: "화 16:00-18:00;목 16:00-18:00")`);
    }
    const status = r.oneOf("verification_status", VERIFICATION_STATUSES, "미확인");
    const lastVerified = r.date("last_verified_at");
    if (status === "확인됨" && !lastVerified) {
      r.report("error", "last_verified_at", "확인됨 상태에는 확인 날짜가 필요");
    }
    return {
      id: r.req("id"),
      name: r.req("name"),
      categories: r.list("categories", CATEGORIES, { required: true }),
      target_grades: r.list("target_grades", GRADES),
      address: r.opt("address"),
      lat,
      lng,
      phone: r.opt("phone"),
      website: r.url("website"),
      instagram: r.url("instagram"),
      naver_place_url: r.url("naver_place_url"),
      tuition_note: r.opt("tuition_note"),
      schedule_note: r.opt("schedule_note"),
      class_style: r.opt("class_style"),
      performance_history: r.opt("performance_history"),
      opened_year: r.int("opened_year"),
      description: r.opt("description"),
      last_verified_at: lastVerified,
      verification_status: status,
      tuition_monthly_min: min,
      tuition_monthly_max: max ?? min,
      schedule_slots: slots,
      source_urls: r.urls("source_urls"),
    };
  });
}

export function parsePeople(text: string, file = "people.csv"): ParseResult<Person> {
  return parseTable(file, text, PERSON_COLUMNS, [], (r) => ({
    id: r.req("id"),
    academy_id: r.req("academy_id"),
    role: r.oneOf("role", ROLES),
    name_public: r.req("name_public"),
    subjects: splitList(r.raw("subjects")),
    profile_source_url: r.url("profile_source_url"),
    // 본인·학원이 직접 공개한 정보만 싣는다 → 공개 근거가 없으면 게재 불가
    disclosure_basis: r.req("disclosure_basis"),
    collected_at: r.date("collected_at", { required: true }) ?? "",
  }));
}

export function parseCareerItems(text: string, file = "career_items.csv"): ParseResult<CareerItem> {
  return parseTable(file, text, CAREER_COLUMNS, [], (r) => {
    const type = r.oneOf("type", CAREER_TYPES);
    const sourceType = r.oneOf("source_type", SOURCE_TYPES);
    const verified = r.bool("verified");
    if (verified && type !== "musical_performance") {
      r.report("error", "verified", "verified=TRUE는 공연 DB로 교차 확인한 뮤지컬 경력(musical_performance)에만 가능");
    }
    if (verified && sourceType !== "KOPIS") {
      r.report("warning", "verified", "verified=TRUE인데 출처가 KOPIS가 아님 — 교차 확인한 공연 DB가 맞는지 점검");
    }
    const from = r.int("year_from");
    const to = r.int("year_to");
    if (from !== null && to !== null && from > to) r.report("error", "year_to", "종료 연도가 시작 연도보다 빠름");
    return {
      id: r.req("id"),
      person_id: r.req("person_id"),
      type,
      title: r.req("title"),
      organization: r.opt("organization"),
      year_from: from,
      year_to: to,
      source_url: r.url("source_url", { required: true }) ?? "",
      source_type: sourceType,
      collected_at: r.date("collected_at", { required: true }) ?? "",
      verified,
    };
  });
}
