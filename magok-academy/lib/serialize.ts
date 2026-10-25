// 레코드 → 정규화된 CSV (임포트 스크립트가 data/에 쓸 때 사용). parse*의 역방향.

import { toCsv } from "./csv.ts";
import { ACADEMY_COLUMNS, ACADEMY_OPTIONAL_COLUMNS, CAREER_COLUMNS, PERSON_COLUMNS } from "./schema.ts";
import type { Academy, CareerItem, Dataset, Person } from "./types.ts";

const s = (v: string | number | null): string => (v === null ? "" : String(v));

function academyRow(a: Academy): Record<string, string> {
  return {
    id: a.id,
    name: a.name,
    categories: a.categories.join(";"),
    target_grades: a.target_grades.join(";"),
    address: s(a.address),
    lat: a.lat === null ? "" : a.lat.toFixed(4),
    lng: a.lng === null ? "" : a.lng.toFixed(4),
    phone: s(a.phone),
    website: s(a.website),
    instagram: s(a.instagram),
    naver_place_url: s(a.naver_place_url),
    tuition_note: s(a.tuition_note),
    schedule_note: s(a.schedule_note),
    class_style: s(a.class_style),
    performance_history: s(a.performance_history),
    opened_year: s(a.opened_year),
    description: s(a.description),
    last_verified_at: s(a.last_verified_at),
    verification_status: a.verification_status,
    tuition_monthly_min: s(a.tuition_monthly_min),
    tuition_monthly_max: s(a.tuition_monthly_max),
    schedule_slots: a.schedule_slots.map((x) => `${x.day} ${x.start}-${x.end}`).join(";"),
    source_urls: a.source_urls.join(";"),
  };
}

function personRow(p: Person): Record<string, string> {
  return {
    id: p.id,
    academy_id: p.academy_id,
    role: p.role,
    name_public: p.name_public,
    subjects: p.subjects.join(";"),
    profile_source_url: s(p.profile_source_url),
    disclosure_basis: p.disclosure_basis,
    collected_at: p.collected_at,
  };
}

function careerRow(c: CareerItem): Record<string, string> {
  return {
    id: c.id,
    person_id: c.person_id,
    type: c.type,
    title: c.title,
    organization: s(c.organization),
    year_from: s(c.year_from),
    year_to: s(c.year_to),
    source_url: c.source_url,
    source_type: c.source_type,
    collected_at: c.collected_at,
    verified: c.verified ? "TRUE" : "FALSE",
  };
}

export function datasetToCsv(d: Dataset): { academies: string; people: string; careerItems: string } {
  return {
    academies: toCsv([...ACADEMY_COLUMNS, ...ACADEMY_OPTIONAL_COLUMNS], d.academies.map(academyRow)),
    people: toCsv(PERSON_COLUMNS, d.people.map(personRow)),
    careerItems: toCsv(CAREER_COLUMNS, d.careerItems.map(careerRow)),
  };
}
