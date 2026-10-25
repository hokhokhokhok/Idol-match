import { SHOW_SORTS, SHOW_STATUSES, isDay, isUuid, type ListShowsParams, type ShowSort, type ShowStatusFilter } from "@/lib/data/shows";

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL 쿼리(status, sort, theater, actor, from, to) → listShows 인자. 잘못된 값은 버린다. */
export function parseShowParams(q: Query): ListShowsParams {
  const status = one(q.status);
  const sort = one(q.sort);
  const theater = one(q.theater);
  const actor = one(q.actor);
  const from = one(q.from);
  const to = one(q.to);
  return {
    status: SHOW_STATUSES.includes(status as ShowStatusFilter) ? (status as ShowStatusFilter) : "current",
    sort: SHOW_SORTS.includes(sort as ShowSort) ? (sort as ShowSort) : "ending",
    theaterId: isUuid(theater) ? theater : undefined,
    actorId: isUuid(actor) ? actor : undefined,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
  };
}
