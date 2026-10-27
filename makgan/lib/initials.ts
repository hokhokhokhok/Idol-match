// 배우 이름 묶음: 한글은 첫소리(ㄱㄴㄷ…), 알파벳은 'A', 나머지는 '#'. DB의 public.actor_initial()과 같은 규칙이어야 한다.
export const INITIALS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "A", "#"] as const;
export type Initial = (typeof INITIALS)[number];

// 초성 19개 → 묶음(쌍자음은 기본 자음에 합친다)
const LEAD: Initial[] = ["ㄱ", "ㄱ", "ㄴ", "ㄷ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅂ", "ㅅ", "ㅅ", "ㅇ", "ㅈ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export function initialOf(name: string): Initial {
  const c = name.codePointAt(0) ?? 0;
  if (c >= 0xac00 && c <= 0xd7a3) return LEAD[Math.floor((c - 0xac00) / 588)];
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return "A";
  return "#";
}

export const initialLabel = (i: Initial) => (i === "A" ? "A–Z" : i === "#" ? "기타" : i);
export const isInitial = (v: unknown): v is Initial => typeof v === "string" && (INITIALS as readonly string[]).includes(v);
