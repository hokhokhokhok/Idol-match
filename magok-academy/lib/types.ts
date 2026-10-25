// 데이터 모델. CSV(data/*.csv)와 이후 Supabase 테이블이 같은 모양을 쓴다.
// Node의 타입 제거 실행(node --test)과 호환되도록 enum 대신 상수 배열 + 유니온을 쓴다.

export const CATEGORIES = ["보컬", "댄스", "발레", "연기", "뮤지컬종합"] as const;
export type Category = (typeof CATEGORIES)[number];

export const GRADES = ["초저", "초고", "중등"] as const;
export type Grade = (typeof GRADES)[number];

export const VERIFICATION_STATUSES = ["미확인", "확인됨"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ROLES = ["원장", "강사"] as const;
export type Role = (typeof ROLES)[number];

export const CAREER_TYPES = [
  "academy_operation",
  "musical_performance",
  "teaching",
  "education",
  "award",
] as const;
export type CareerType = (typeof CAREER_TYPES)[number];

export const SOURCE_TYPES = ["학원알리미", "홈페이지", "SNS", "네이버플레이스", "KOPIS", "직접문의"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** 필터용으로 구조화한 수업 시간 한 칸. 예: { day: "화", start: "16:00", end: "18:00" } */
export interface ScheduleSlot {
  day: Weekday;
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface Academy {
  id: string;
  name: string;
  categories: Category[];
  target_grades: Grade[];
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  naver_place_url: string | null;
  /** 사람이 읽는 수강료 안내 원문 (공시 금액과 홈페이지 안내가 다르면 둘 다) */
  tuition_note: string | null;
  schedule_note: string | null;
  class_style: string | null;
  performance_history: string | null;
  opened_year: number | null;
  description: string | null;
  last_verified_at: string | null; // YYYY-MM-DD
  verification_status: VerificationStatus;
  // ── 필터용 선택 컬럼 (CSV에 없거나 비어 있으면 null/빈 배열 → 해당 필터에서 "정보 없음") ──
  /** 월 수강료 하한(원). tuition_note에서 확인된 금액만 옮긴다. */
  tuition_monthly_min: number | null;
  /** 월 수강료 상한(원). 단일 금액이면 min과 같게. */
  tuition_monthly_max: number | null;
  schedule_slots: ScheduleSlot[];
}

export interface Person {
  id: string;
  academy_id: string;
  role: Role;
  name_public: string;
  subjects: string[];
  profile_source_url: string | null;
  /** 공개 근거. 예: "학원 홈페이지에 본인 공개" — 비어 있으면 게재하지 않는다. */
  disclosure_basis: string;
  collected_at: string; // YYYY-MM-DD
}

export interface CareerItem {
  id: string;
  person_id: string;
  type: CareerType;
  title: string;
  organization: string | null;
  year_from: number | null;
  /** 비어 있으면 현재 진행 중이거나 종료 연도 미상 */
  year_to: number | null;
  source_url: string;
  source_type: SourceType;
  collected_at: string; // YYYY-MM-DD
  /** 공연 DB(KOPIS 등)로 교차 확인한 뮤지컬 경력만 true */
  verified: boolean;
}

export interface Dataset {
  academies: Academy[];
  people: Person[];
  careerItems: CareerItem[];
}

/** 상세 화면용으로 묶은 형태 */
export interface PersonWithCareer extends Person {
  careers: CareerItem[];
}
export interface AcademyDetail extends Academy {
  people: PersonWithCareer[];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  보컬: "보컬",
  댄스: "댄스",
  발레: "발레",
  연기: "연기",
  뮤지컬종합: "뮤지컬 종합",
};

export const GRADE_LABEL: Record<Grade, string> = {
  초저: "초등 저학년",
  초고: "초등 고학년",
  중등: "중등",
};

export const CAREER_TYPE_LABEL: Record<CareerType, string> = {
  academy_operation: "학원 운영",
  musical_performance: "뮤지컬 활동",
  teaching: "강의",
  education: "학력",
  award: "수상",
};
