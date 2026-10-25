// 뮤지컬 경력(musical_performance)을 KOPIS 공연 DB와 대조: KOPIS_API_KEY=<키> npm run kopis:check
// 경력 제목의 '작품명'으로 공연을 찾고, 공연 상세의 출연진·제작진 명단에 인물 이름이 있는지 확인한다.
// 결과만 출력하고 CSV는 고치지 않는다 — 확인되면 career_items.csv의 verified를 사람이 TRUE로 바꾼다.
// 주의: KOPIS 명단은 일부만 제공("…등")되므로 '못 찾음'이 '출연 안 함'을 뜻하지는 않는다.
// 프록시 환경이면 NODE_USE_ENV_PROXY=1 을 함께 준다 (Node fetch는 기본으로 HTTPS_PROXY를 쓰지 않음).
import path from "node:path";
import { loadDatasetFromDir } from "../lib/dataset.ts";

const KEY = process.env.KOPIS_API_KEY;
if (!KEY) {
  console.error("KOPIS_API_KEY 환경 변수가 필요합니다 (KOPIS 오픈API 서비스 키).");
  process.exit(2);
}
const API = "https://kopis.or.kr/openApi/restful/pblprfr";
const tag = (xml: string, k: string) => xml.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`))?.[1]?.trim() ?? "";

let failed = 0;
async function get(url: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (r.ok) return await r.text();
    } catch {}
  }
  failed++;
  return "";
}

const { dataset } = loadDatasetFromDir(path.join(import.meta.dirname, "..", "data"));
const people = new Map(dataset.people.map((p) => [p.id, p]));
const thisYear = new Date().getFullYear();

for (const c of dataset.careerItems.filter((x) => x.type === "musical_performance")) {
  const person = people.get(c.person_id)!;
  // "엄소연 (소연아이 대표)" → "엄소연", "김보경 원장" → "김보경"
  const name = person.name_public.replace(/\(.*?\)/g, "").replace(/원장|대표|강사|이사|님/g, "").trim();
  const titles = [...c.title.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const from = c.year_from ?? 2000;
  const to = c.year_to ?? c.year_from ?? thisYear;
  console.log(`\n[${c.id}] ${person.name_public} — ${c.title}`);
  if (!titles.length || !name || name.includes("미공개")) {
    console.log("  작품명(따옴표) 또는 공개 이름이 없어 대조 생략");
    continue;
  }
  for (const t of titles) {
    const hits: string[] = [];
    for (let y = from; y <= to; y += 5) {
      const ye = Math.min(y + 4, to);
      const xml = await get(`${API}?service=${KEY}&stdate=${y}0101&eddate=${ye}1231&cpage=1&rows=100&shprfnm=${encodeURIComponent(t)}`);
      for (const db of xml.match(/<db>[\s\S]*?<\/db>/g) ?? []) hits.push(tag(db, "mt20id"));
    }
    if (!hits.length) {
      console.log(failed ? `  '${t}': 요청 실패 — 네트워크·키 확인 필요` : `  '${t}': KOPIS에서 공연을 찾지 못함`);
      continue;
    }
    for (const id of [...new Set(hits)]) {
      const d = await get(`${API}/${id}?service=${KEY}`);
      const found = d.includes(name);
      console.log(`  ${found ? "✔ 명단에 있음" : "· 명단에 없음"} ${id} ${tag(d, "prfnm")} ${tag(d, "prfpdfrom")} ${tag(d, "fcltynm")}`);
    }
  }
}

if (failed) {
  console.error(`\n요청 ${failed}건 실패 — 결과가 불완전합니다.`);
  process.exit(1);
}
