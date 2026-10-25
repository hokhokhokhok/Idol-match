// 관리자 화면에서 다루는 테이블 정의(서버 검증·폼 렌더링 공용). 캐스팅은 공연 편집 화면에서 따로 다룬다.
export type FieldType = "text" | "textarea" | "date" | "datetime" | "number" | "url" | "select";
export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;                                    // 글자 수(텍스트) 또는 최댓값(숫자)
  options?: "theaters" | "shows" | readonly { value: string; label: string }[];
  hint?: string;
};
export type Entity = {
  key: "shows" | "actors" | "theaters" | "benefits";
  label: string;
  titleField: string;
  order: { column: string; ascending: boolean };
  fields: readonly Field[];
};

export const ADMIN_ENTITIES: Record<Entity["key"], Entity> = {
  shows: {
    key: "shows", label: "공연", titleField: "title", order: { column: "starts_on", ascending: false },
    fields: [
      { name: "title", label: "제목", type: "text", required: true, max: 200 },
      { name: "theater_id", label: "극장", type: "select", options: "theaters" },
      { name: "starts_on", label: "개막일", type: "date", required: true },
      { name: "ends_on", label: "종료일", type: "date", required: true },
      { name: "poster_url", label: "포스터 이미지 주소", type: "url", max: 1000 },
      { name: "synopsis", label: "소개", type: "textarea", max: 5000 },
    ],
  },
  actors: {
    key: "actors", label: "배우", titleField: "name", order: { column: "name", ascending: true },
    fields: [
      { name: "name", label: "이름", type: "text", required: true, max: 100 },
      { name: "photo_url", label: "사진 주소", type: "url", max: 1000, hint: "초상권을 확인한 이미지만 넣어 주세요" },
      { name: "bio", label: "소개", type: "textarea", max: 3000 },
    ],
  },
  theaters: {
    key: "theaters", label: "극장", titleField: "name", order: { column: "name", ascending: true },
    fields: [
      { name: "name", label: "이름", type: "text", required: true, max: 100 },
      { name: "address", label: "주소", type: "text", max: 300 },
      { name: "seat_count", label: "좌석 수", type: "number", max: 100000 },
      { name: "map_url", label: "지도 링크", type: "url", max: 1000 },
    ],
  },
  benefits: {
    key: "benefits", label: "혜택", titleField: "title", order: { column: "created_at", ascending: false },
    fields: [
      {
        name: "type", label: "종류", type: "select", required: true,
        options: [
          { value: "lottery", label: "로터리" }, { value: "discount", label: "할인" },
          { value: "ticket_open", label: "티켓오픈" }, { value: "event", label: "이벤트" },
        ],
      },
      { name: "title", label: "제목", type: "text", required: true, max: 200 },
      { name: "show_id", label: "공연(선택)", type: "select", options: "shows" },
      { name: "starts_at", label: "시작(티켓오픈은 오픈 시각)", type: "datetime", hint: "한국 시간" },
      { name: "ends_at", label: "마감", type: "datetime", hint: "한국 시간" },
      { name: "source_name", label: "출처 이름", type: "text", max: 100 },
      { name: "source_url", label: "출처 링크", type: "url", max: 1000 },
      { name: "note", label: "메모", type: "textarea", max: 2000 },
    ],
  },
};

export const isEntityKey = (v: string): v is Entity["key"] => v in ADMIN_ENTITIES;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 'YYYY-MM-DDTHH:mm'(KST) → ISO */
export const kstLocalToIso = (v: string) => new Date(`${v}:00+09:00`).toISOString();
/** ISO → 'YYYY-MM-DDTHH:mm'(KST), datetime-local 기본값용 */
export const isoToKstLocal = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16);

/** 폼 값 검증 → DB 행. 빈 칸은 null. 첫 문제 하나만 돌려준다. */
export function parseEntityForm(entity: Entity, form: FormData): { value: Record<string, unknown> } | { error: string } {
  const out: Record<string, unknown> = {};
  for (const f of entity.fields) {
    const raw = String(form.get(f.name) ?? "").trim();
    if (!raw) {
      if (f.required) return { error: `${f.label}을(를) 입력해 주세요` };
      out[f.name] = null;
      continue;
    }
    switch (f.type) {
      case "text":
      case "textarea":
        if (f.max && raw.length > f.max) return { error: `${f.label}은(는) ${f.max}자까지예요` };
        out[f.name] = raw;
        break;
      case "url":
        if (!/^https?:\/\/[^\s]+$/i.test(raw) || (f.max && raw.length > f.max)) return { error: `${f.label}은(는) http(s) 주소로 입력해 주세요` };
        out[f.name] = raw;
        break;
      case "date":
        if (!DAY_RE.test(raw) || Number.isNaN(Date.parse(raw))) return { error: `${f.label} 날짜를 확인해 주세요` };
        out[f.name] = raw;
        break;
      case "datetime":
        if (!DT_RE.test(raw) || Number.isNaN(Date.parse(`${raw}:00+09:00`))) return { error: `${f.label} 시각을 확인해 주세요` };
        out[f.name] = kstLocalToIso(raw);
        break;
      case "number": {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0 || (f.max && n > f.max)) return { error: `${f.label}은(는) 양의 정수로 입력해 주세요` };
        out[f.name] = n;
        break;
      }
      case "select":
        if (Array.isArray(f.options)) {
          if (!f.options.some((o) => o.value === raw)) return { error: `${f.label}을(를) 다시 골라 주세요` };
        } else if (!UUID_RE.test(raw)) return { error: `${f.label}을(를) 다시 골라 주세요` };
        out[f.name] = raw;
        break;
    }
  }
  if (entity.key === "shows" && String(out.ends_on) < String(out.starts_on)) return { error: "종료일이 개막일보다 빨라요" };
  if (entity.key === "benefits" && out.starts_at && out.ends_at && String(out.ends_at) < String(out.starts_at)) return { error: "마감이 시작보다 빨라요" };
  return { value: out };
}
