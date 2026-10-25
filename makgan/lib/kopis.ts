// 공연예술통합전산망(KOPIS) Open API 응답 해석 — 서버 가져오기·스크립트·단위 테스트 공용(의존성 없음)
// 공식 데이터만 쓴다: 배역 이름은 KOPIS에 없어 가져오지 않는다.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    try {
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
    } catch { return m; }
    return ENTITIES[k] ?? m;
  });

/** <db>…</db> 별로 태그→값. 같은 이름이 중첩 안에 또 나오면 바깥(먼저 나온) 값을 쓴다. */
export function parseDbs(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(/<db>([\s\S]*?)<\/db>/g)) {
    const rec: Record<string, string> = {};
    for (const t of m[1].matchAll(/<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g)) {
      if (!(t[1] in rec)) rec[t[1]] = decode((t[2] ?? t[3] ?? "").trim());
    }
    out.push(rec);
  }
  return out;
}

/** 'YYYY.MM.DD' → 'YYYY-MM-DD' (아니면 null) */
export function kopisDate(s: string | undefined): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec((s ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** KOPIS 포스터는 http 주소라 https 화면에서 막힌다 → https 본 주소로 */
export function posterHttps(url: string | undefined): string | null {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u.replace(/^http:\/\/www\.kopis\.or\.kr\//i, "https://kopis.or.kr/").replace(/^http:\/\//i, "https://");
}

/** 출연진 문자열("홍길동, 김철수 외 3명") → 이름 목록. 괄호 안 배역 표기·'등'·'외 N명'은 버린다. */
export function castNames(prfcast: string | undefined, max = 40): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (let raw of (prfcast ?? "").split(/[,，、/·\n]/)) {
    raw = raw.replace(/\(.*?\)/g, "").replace(/\s*(외\s*\d*\s*명?|등)\s*$/u, "").trim();
    if (raw.length < 2 || raw.length > 30 || /^[\d\s\p{P}\p{S}]+$/u.test(raw) || /출연진|미정|추후|공개/.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    names.push(raw);
    if (names.length >= max) break;
  }
  return names;
}

export type KopisListItem = {
  id: string; title: string; startsOn: string; endsOn: string; posterUrl: string | null;
  facilityName: string; genre: string; state: string;
};
export function parseList(xml: string): KopisListItem[] {
  const items: KopisListItem[] = [];
  for (const r of parseDbs(xml)) {
    const startsOn = kopisDate(r.prfpdfrom);
    const endsOn = kopisDate(r.prfpdto);
    if (!r.mt20id || !r.prfnm || !startsOn || !endsOn || endsOn < startsOn) continue;
    items.push({ id: r.mt20id, title: r.prfnm.slice(0, 200), startsOn, endsOn, posterUrl: posterHttps(r.poster), facilityName: r.fcltynm ?? "", genre: r.genrenm ?? "", state: r.prfstate ?? "" });
  }
  return items;
}

export type KopisDetail = {
  synopsis: string | null; facilityId: string | null; cast: string[];
  ticketUrl: string | null; ticketName: string | null; posterUrl: string | null;
};
export function parseDetail(xml: string): KopisDetail | null {
  const r = parseDbs(xml)[0];
  if (!r?.mt20id) return null;
  const sty = (r.sty ?? "").replace(/^\s*\[공연소개\]\s*/u, "").trim();
  // 예매처 링크: 첫 번째 http(s) 주소
  const rel = /<relatenm>([^<]*)<\/relatenm>\s*<relateurl>([^<]*)<\/relateurl>/.exec(xml);
  const url = rel ? decode(rel[2].trim()) : "";
  return {
    synopsis: sty ? sty.slice(0, 5000) : null,
    facilityId: r.mt10id || null,
    cast: castNames(r.prfcast),
    ticketUrl: /^https?:\/\/[^\s]+$/i.test(url) ? url.slice(0, 1000) : null,
    ticketName: rel && /^https?:\/\//i.test(url) ? decode(rel[1].trim()).slice(0, 50) || null : null,
    posterUrl: posterHttps(r.poster),
  };
}

export type KopisFacility = { name: string; address: string | null; seatCount: number | null; lat: number | null; lng: number | null; mapUrl: string | null };
export function parseFacility(xml: string): KopisFacility | null {
  const r = parseDbs(xml)[0];
  if (!r?.fcltynm) return null;
  const seats = Number(r.seatscale);
  const lat = Number(r.la);
  const lng = Number(r.lo);
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lat < 40 && lng > 120 && lng < 135;
  return {
    name: r.fcltynm.slice(0, 100),
    address: r.adres ? r.adres.slice(0, 300) : null,
    seatCount: Number.isInteger(seats) && seats > 0 ? seats : null,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
    // 카카오맵 공개 링크 형식(키 불필요)
    mapUrl: hasGeo ? `https://map.kakao.com/link/map/${encodeURIComponent(r.fcltynm)},${lat},${lng}` : null,
  };
}

/** KOPIS는 키 오류·한도 초과를 200 응답의 <returncode>/<errmsg>로 알린다 → 오류 문장(없으면 null) */
export function kopisError(xml: string): string | null {
  const r = parseDbs(xml)[0];
  if (r && r.returncode && !r.mt20id && !r.mt10id) return `KOPIS 오류 ${r.returncode}${r.errmsg ? `: ${r.errmsg}` : ""}`.slice(0, 200);
  return null;
}
