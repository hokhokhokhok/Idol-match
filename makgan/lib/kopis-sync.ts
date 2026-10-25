// KOPIS 공식 데이터 → 막간 DB. 서버(크론·관리자 버튼)와 scripts/kopis-import.mjs가 같이 쓴다.
// 서비스 키 클라이언트(RLS 우회)로만 실행한다. 관리자가 직접 넣은 행(external_id 없음)은 건드리지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { kopisError, parseDetail, parseFacility, parseList, type KopisDetail, type KopisFacility, type KopisListItem } from "./kopis.ts";

export const KOPIS_BASE = "https://kopis.or.kr/openApi/restful";
const GENRES = ["GGGA", "AAAA"] as const;       // 뮤지컬, 연극
const STATES = ["01", "02"] as const;           // 공연예정, 공연중
const CAST_ROLE = "출연";                        // KOPIS에는 배역이 없다

export type SyncOptions = {
  key: string;
  baseUrl?: string;
  now?: Date;
  windowDays?: number;      // 오늘부터 며칠 뒤까지 열리는 공연(기본 120)
  maxDetails?: number;      // 한 번에 상세(소개·출연진)를 받을 최대 편수(기본 1500)
  staleDays?: number;       // 상세를 이만큼 지나면 다시 받음(기본 3)
  timeBudgetMs?: number;    // 넘으면 새 묶음을 시작하지 않고 멈춤(다음 실행이 이어서)
  concurrency?: number;
  fetchText?: (url: string) => Promise<string>;
  log?: (msg: string) => void;
};

export type SyncResult = {
  listed: number; created: number; updated: number; detailed: number;
  theaters: number; actors: number; castsAdded: number; castsRemoved: number;
  pendingDetails: number; partial: boolean; errors: string[];
};

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const compact = (day: string) => day.replaceAll("-", "");
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** 키가 들어간 주소는 오류 메시지·로그에 절대 남기지 않는다 */
function defaultFetchText(key: string) {
  return async (url: string) => {
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/xml" } });
        if (res.ok) return await res.text();
        last = `HTTP ${res.status}`;
      } catch (e) {
        last = (e as Error).name === "TimeoutError" ? "timeout" : "network";
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    throw new Error(`KOPIS ${last} (${new URL(url).pathname})`.replaceAll(key, "<key>"));
  };
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function syncKopis(db: SupabaseClient, opts: SyncOptions): Promise<SyncResult> {
  const started = Date.now();
  const base = opts.baseUrl ?? KOPIS_BASE;
  const now = opts.now ?? new Date();
  const fetchText = opts.fetchText ?? defaultFetchText(opts.key);
  const log = opts.log ?? (() => {});
  const concurrency = opts.concurrency ?? 6;
  const staleBefore = now.getTime() - (opts.staleDays ?? 3) * 86400e3;
  const result: SyncResult = { listed: 0, created: 0, updated: 0, detailed: 0, theaters: 0, actors: 0, castsAdded: 0, castsRemoved: 0, pendingDetails: 0, partial: false, errors: [] };
  const fail = (msg: string) => { if (result.errors.length < 20) result.errors.push(msg.replaceAll(opts.key, "<key>")); };
  const q = (path: string, params: Record<string, string>) => `${base}/${path}?${new URLSearchParams({ service: opts.key, ...params })}`;

  // 1) 목록: 뮤지컬·연극 × 공연예정·공연중, 100개씩
  const from = kstDay(now);
  const to = kstDay(new Date(now.getTime() + (opts.windowDays ?? 120) * 86400e3));
  const list = new Map<string, KopisListItem>();
  for (const genre of GENRES) {
    for (const state of STATES) {
      for (let page = 1; page <= 40; page++) {
        const xml = await fetchText(q("pblprfr", { stdate: compact(from), eddate: compact(to), cpage: String(page), rows: "100", shcate: genre, prfstate: state }));
        const err = kopisError(xml);
        if (err) throw new Error(err);    // 키 오류·한도 초과는 조용히 0건으로 끝내지 않고 실패시킨다
        const items = parseList(xml);
        for (const it of items) list.set(it.id, it);
        if ((xml.match(/<db>/g)?.length ?? 0) < 100) break;
      }
    }
  }
  result.listed = list.size;
  log(`목록 ${list.size}편`);
  if (!list.size) { fail("KOPIS 목록이 비어 있어요(기존 공연은 그대로 둡니다)"); return result; }
  const all = [...list.values()];

  // 2) 이미 있는 공연
  const existing = new Map<string, { id: string; synced: number | null }>();
  for (const part of chunks(all.map((s) => `kopis:${s.id}`), 100)) {
    const { data, error } = await db.from("shows").select("id, external_id, external_synced_at").in("external_id", part);
    if (error) throw new Error(`기존 공연 조회 실패: ${error.message}`);
    for (const r of data ?? []) existing.set(r.external_id as string, { id: r.id as string, synced: r.external_synced_at ? Date.parse(r.external_synced_at as string) : null });
  }

  // 3) 상세를 받을 대상: 새 공연 → 상세가 없는 공연 → 오래된 순
  const needsDetail = all
    .filter((s) => { const e = existing.get(`kopis:${s.id}`); return !e || e.synced === null || e.synced < staleBefore; })
    .sort((a, b) => (existing.get(`kopis:${a.id}`)?.synced ?? 0) - (existing.get(`kopis:${b.id}`)?.synced ?? 0));
  const budget = new Set(needsDetail.slice(0, opts.maxDetails ?? 1500).map((s) => s.id));
  result.pendingDetails = Math.max(0, needsDetail.length - budget.size);

  const theaterIds = new Map<string, string>();   // 'FC…' → theaters.id
  const actorIds = new Map<string, string>();     // 이름 → actors.id

  async function resolveTheaters(facilities: Map<string, string>) {  // facilityId → 이름(목록에서)
    const missing = [...facilities.keys()].filter((f) => !theaterIds.has(f));
    for (const part of chunks(missing, 100)) {
      const { data } = await db.from("theaters").select("id, external_id").in("external_id", part.map((f) => `kopis:${f}`));
      for (const r of data ?? []) theaterIds.set((r.external_id as string).slice(6), r.id as string);
    }
    const toCreate = missing.filter((f) => !theaterIds.has(f));
    const fetched = await pool(toCreate, concurrency, async (f) => {
      try { return [f, parseFacility(await fetchText(q(`prfplc/${f}`, {})))] as const; } catch (e) { fail((e as Error).message); return [f, null] as const; }
    });
    const rows = fetched.map(([f, fac]: readonly [string, KopisFacility | null]) => ({
      external_id: `kopis:${f}`,
      name: fac?.name ?? facilities.get(f) ?? f,
      address: fac?.address ?? null, seat_count: fac?.seatCount ?? null, map_url: fac?.mapUrl ?? null, lat: fac?.lat ?? null, lng: fac?.lng ?? null,
    }));
    for (const part of chunks(rows, 100)) {
      const { data, error } = await db.from("theaters").upsert(part, { onConflict: "external_id" }).select("id, external_id");
      if (error) { fail(`극장 저장 실패: ${error.message}`); continue; }
      for (const r of data ?? []) theaterIds.set((r.external_id as string).slice(6), r.id as string);
      result.theaters += data?.length ?? 0;
    }
  }

  async function resolveActors(names: string[]) {
    const missing = [...new Set(names)].filter((n) => !actorIds.has(n));
    for (const part of chunks(missing, 100)) {
      const { data } = await db.from("actors").select("id, name").in("name", part).order("created_at");
      for (const r of data ?? []) if (!actorIds.has(r.name as string)) actorIds.set(r.name as string, r.id as string);
    }
    const toCreate = missing.filter((n) => !actorIds.has(n));
    for (const part of chunks(toCreate, 200)) {
      const { data, error } = await db.from("actors").insert(part.map((name) => ({ name }))).select("id, name");
      if (error) { fail(`배우 저장 실패: ${error.message}`); continue; }
      for (const r of data ?? []) actorIds.set(r.name as string, r.id as string);
      result.actors += data?.length ?? 0;
    }
  }

  // 4) 묶음 단위 처리
  for (const batch of chunks(all, 100)) {
    if (opts.timeBudgetMs && Date.now() - started > opts.timeBudgetMs) { result.partial = true; break; }

    const detailTargets = batch.filter((s) => budget.has(s.id));
    const details = new Map<string, KopisDetail>();
    await pool(detailTargets, concurrency, async (s) => {
      try {
        const xml = await fetchText(q(`pblprfr/${s.id}`, {}));
        const d = kopisError(xml) ? null : parseDetail(xml);
        if (d) details.set(s.id, d); else fail(`상세를 못 읽음: ${s.id}${kopisError(xml) ? ` (${kopisError(xml)})` : ""}`);
      } catch (e) { fail((e as Error).message); }
    });
    result.detailed += details.size;

    const facilities = new Map<string, string>();
    for (const s of batch) { const f = details.get(s.id)?.facilityId; if (f) facilities.set(f, s.facilityName); }
    await resolveTheaters(facilities);

    const baseRows = batch.filter((s) => !details.has(s.id)).map((s) => ({ external_id: `kopis:${s.id}`, title: s.title, starts_on: s.startsOn, ends_on: s.endsOn, poster_url: s.posterUrl }));
    const fullRows = batch.filter((s) => details.has(s.id)).map((s) => {
      const d = details.get(s.id)!;
      return {
        external_id: `kopis:${s.id}`, title: s.title, starts_on: s.startsOn, ends_on: s.endsOn, poster_url: d.posterUrl ?? s.posterUrl,
        synopsis: d.synopsis, theater_id: d.facilityId ? theaterIds.get(d.facilityId) ?? null : null,
        ticket_url: d.ticketUrl, ticket_name: d.ticketName, external_synced_at: now.toISOString(),
      };
    });
    const showIds = new Map<string, string>();
    for (const rows of [baseRows, fullRows]) {
      if (!rows.length) continue;
      const { data, error } = await db.from("shows").upsert(rows, { onConflict: "external_id" }).select("id, external_id");
      if (error) { fail(`공연 저장 실패: ${error.message}`); continue; }
      for (const r of data ?? []) showIds.set(r.external_id as string, r.id as string);
    }
    for (const s of batch) {
      if (!showIds.has(`kopis:${s.id}`)) continue;
      if (existing.has(`kopis:${s.id}`)) result.updated++; else result.created++;
    }

    // 5) 출연진: 이 가져오기가 만든 '출연' 행만 맞춘다(관리자가 넣은 배역 캐스팅은 그대로)
    const withCast = fullRows.map((r) => ({ id: showIds.get(r.external_id), names: details.get(r.external_id.slice(6))!.cast })).filter((x): x is { id: string; names: string[] } => Boolean(x.id));
    if (withCast.length) {
      await resolveActors(withCast.flatMap((x) => x.names));
      const current = new Map<string, { id: string; actor_id: string }[]>();
      for (const part of chunks(withCast.map((x) => x.id), 100)) {
        const { data } = await db.from("casts").select("id, show_id, actor_id").in("show_id", part).eq("role_name", CAST_ROLE).is("perf_date", null);
        for (const r of data ?? []) current.set(r.show_id as string, [...(current.get(r.show_id as string) ?? []), { id: r.id as string, actor_id: r.actor_id as string }]);
      }
      const toInsert: { show_id: string; actor_id: string; role_name: string }[] = [];
      const toDelete: string[] = [];
      for (const { id, names } of withCast) {
        const want = new Set(names.map((n) => actorIds.get(n)).filter((x): x is string => Boolean(x)));
        const have = current.get(id) ?? [];
        for (const c of have) if (!want.has(c.actor_id)) toDelete.push(c.id);
        const haveIds = new Set(have.map((c) => c.actor_id));
        for (const a of want) if (!haveIds.has(a)) toInsert.push({ show_id: id, actor_id: a, role_name: CAST_ROLE });
      }
      for (const part of chunks(toDelete, 100)) {
        const { error } = await db.from("casts").delete().in("id", part);
        if (error) fail(`출연진 삭제 실패: ${error.message}`); else result.castsRemoved += part.length;
      }
      for (const part of chunks(toInsert, 300)) {
        const { error } = await db.from("casts").insert(part);
        if (error) fail(`출연진 저장 실패: ${error.message}`); else result.castsAdded += part.length;
      }
    }
    log(`묶음 완료: 누적 공연 ${result.created + result.updated}, 상세 ${result.detailed}`);
  }
  return result;
}
