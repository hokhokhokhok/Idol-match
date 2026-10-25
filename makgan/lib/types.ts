// DB 행 타입(필요한 컬럼만). 스키마: supabase/migrations
export type Theater = { id: string; name: string; address: string | null; seat_count: number | null; map_url: string | null };

export type ShowSummary = {
  id: string;
  title: string;
  starts_on: string;
  ends_on: string;
  poster_url: string | null;
  theater: { id: string; name: string } | null;
};

export type ShowDetail = ShowSummary & {
  synopsis: string | null;
  external_id: string | null;
  ticket_url: string | null;
  ticket_name: string | null;
  avg_rating: number | null;
  review_count: number;
};

export type CastMember = { actor_id: string; name: string; photo_url: string | null; role_name: string };
export type CastResult = { kind: "date" | "season"; date: string | null; members: CastMember[] };

/** 팔로우·찜 토글 서버 액션 결과 */
export type ToggleResult = { on: boolean } | { needLogin: true } | { error: string };
