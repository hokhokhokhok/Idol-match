// 시즌 통계(SPEC-2 B-5) 계산 — 서버 화면·단위 테스트 공용

export type StatReview = { id: string; watched_at: string; rating: number; price: number | null; show: { id: string; title: string } };
export type StatCast = { review_id: string; actor_id: string; name: string };
export type Ranked = { id: string; name: string; count: number };

export type Stats = {
  year: number;
  count: number;
  totalSpent: number;
  pricedCount: number;     // 관람료를 적은 후기 수(총 지출이 일부만 집계됐는지 알리기 위해)
  avgRating: number | null;
  monthly: number[];       // 1~12월 관극 횟수
  topShows: Ranked[];
  topActors: Ranked[] | null; // 구조화된 캐스트 입력이 하나도 없으면 null
  years: number[];         // 기록이 있는 연도(최근 순)
};

/** 같은 횟수면 이름순, 최대 3개 */
function top3(counts: Map<string, Ranked>): Ranked[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko")).slice(0, 3);
}

export function computeStats(reviews: StatReview[], casts: StatCast[], year: number): Stats {
  const inYear = reviews.filter((r) => Number(r.watched_at.slice(0, 4)) === year);
  const ids = new Set(inYear.map((r) => r.id));
  const monthly = Array.from({ length: 12 }, () => 0);
  const shows = new Map<string, Ranked>();
  let total = 0;
  let priced = 0;
  for (const r of inYear) {
    monthly[Number(r.watched_at.slice(5, 7)) - 1]++;
    if (r.price != null) { total += r.price; priced++; }
    const s = shows.get(r.show.id) ?? { id: r.show.id, name: r.show.title, count: 0 };
    s.count++;
    shows.set(r.show.id, s);
  }
  // 한 후기에서 같은 배우가 두 배역이어도 1회
  const actors = new Map<string, Ranked>();
  const seen = new Set<string>();
  const yearCasts = casts.filter((c) => ids.has(c.review_id));
  for (const c of yearCasts) {
    const key = `${c.review_id}:${c.actor_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = actors.get(c.actor_id) ?? { id: c.actor_id, name: c.name, count: 0 };
    a.count++;
    actors.set(c.actor_id, a);
  }
  const years = [...new Set(reviews.map((r) => Number(r.watched_at.slice(0, 4))))].sort((a, b) => b - a);
  return {
    year,
    count: inYear.length,
    totalSpent: total,
    pricedCount: priced,
    avgRating: inYear.length ? Math.round((inYear.reduce((a, r) => a + r.rating, 0) / inYear.length) * 10) / 10 : null,
    monthly,
    topShows: top3(shows),
    topActors: yearCasts.length ? top3(actors) : null,
    years,
  };
}
