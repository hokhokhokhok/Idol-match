// 배우 인기 등급. 점수는 내부 계산에만 쓰고 화면에는 등급(색)만 보여 준다.
export type Tier = "S" | "A" | "B" | "C" | "D";
export const TIERS: Tier[] = ["S", "A", "B", "C", "D"];

export type Activity = { actor_id: string; shows: number; recent: number; followers: number; reviews: number; news: number };

const ln = (n: number) => Math.log1p(Math.max(0, n));

/** 작품 수·최근 1년 활동·팔로워·후기 속 출연·뉴스 언급량을 로그로 눌러 합친 값 */
export function scoreOf(a: Activity) {
  return 3 * ln(a.shows) + 2 * ln(a.recent) + 2 * ln(a.followers) + 1.5 * ln(a.reviews) + 1.5 * ln(a.news / 10);
}

// 상위 비율(누적). 같은 점수는 같은 등급으로 묶는다.
const CUTS: [Tier, number][] = [["S", 0.02], ["A", 0.1], ["B", 0.3], ["C", 0.6]];

export function assignTiers(list: Activity[]): Map<string, Tier> {
  const scored = list.map((a) => ({ id: a.actor_id, s: scoreOf(a) })).sort((x, y) => y.s - x.s || x.id.localeCompare(y.id));
  const out = new Map<string, Tier>();
  const n = scored.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scored[j + 1].s === scored[i].s) j++;
    // 동점 묶음은 가장 앞 순위(i) 기준으로 같은 등급
    const ratio = i / n;
    const tier = CUTS.find(([, cut]) => ratio < cut)?.[0] ?? "D";
    for (let k = i; k <= j; k++) out.set(scored[k].id, tier);
    i = j + 1;
  }
  return out;
}

export const TIER_NAMES: Record<Tier, string> = { S: "무지개", A: "골드", B: "실버", C: "브론즈", D: "일반" };
export const isTier = (v: unknown): v is Tier => typeof v === "string" && (TIERS as string[]).includes(v);
