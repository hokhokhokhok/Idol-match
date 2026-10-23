// 조문 원문 받기 (2차): 법제처 국가법령정보 공동활용 Open API로 현행 조문을 law-texts/*.json 에 저장한다.
// 받은 파일은 빌드에 포함되어 앱의 '근거 조문 원문 보기'가 오프라인에서도 동작한다.
//
//   LAW_OC=발급받은ID npm run fetch-law -- 건축법 "건축법 시행령"
//   LAW_OC=발급받은ID npm run fetch-law -- --all        감관법 9개 법률의 법·시행령·시행규칙 전부
//
// OC 값: https://open.law.go.kr 에서 회원가입 → Open API 활용 신청(승인 필요) 후 받은 ID(이메일 앞부분).
// API 응답 형식이 바뀌면 이 스크립트를 고쳐야 한다. 받은 조문도 law.go.kr 화면과 한 번 대조할 것.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OC = process.env.LAW_OC;
const args = process.argv.slice(2);
const LAWS = [
  '국토의 계획 및 이용에 관한 법률',
  '부동산 가격공시에 관한 법률',
  '감정평가 및 감정평가사에 관한 법률',
  '국유재산법',
  '건축법',
  '공간정보의 구축 및 관리 등에 관한 법률',
  '부동산등기법',
  '도시 및 주거환경정비법',
  '동산·채권 등의 담보에 관한 법률',
];
const targets = args.includes('--all')
  ? LAWS.flatMap((l) => [l, `${l} 시행령`, `${l} 시행규칙`])
  : args.filter((a) => !a.startsWith('--'));

if (!OC || !targets.length) {
  console.error('사용법: LAW_OC=<Open API ID> npm run fetch-law -- <법령명...> | --all');
  process.exit(1);
}

type Json = Record<string, unknown>;
const arr = <T,>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join('\n') : v == null ? '' : String(v)).trim();
const squash = (s: string) => s.replace(/\s+/g, '');

async function getJson(path: string, params: Record<string, string>) {
  const url = `https://www.law.go.kr/DRF/${path}?${new URLSearchParams({ OC: OC!, type: 'JSON', ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new Error(`JSON이 아닌 응답(OC 승인·IP 등록 확인): ${text.slice(0, 200)}`);
  }
}

/** 조문단위 1개 → { key: "제84조의2", title, text } */
function article(u: Json) {
  if (str(u['조문여부']) && str(u['조문여부']) !== '조문') return null; // 장·절 제목
  const no = str(u['조문번호']);
  if (!no) return null;
  const branch = str(u['조문가지번호']);
  const key = `제${no}조${branch && branch !== '0' ? `의${branch}` : ''}`;
  const lines: string[] = [];
  const head = str(u['조문내용']).replace(/^제\s*\d+\s*조(?:의\s*\d+)?\s*(\([^)]*\))?\s*/, '');
  if (head) lines.push(head);
  for (const h of arr(u['항'] as Json | Json[])) {
    if (str(h['항내용'])) lines.push(str(h['항내용']));
    for (const ho of arr(h['호'] as Json | Json[])) {
      if (str(ho['호내용'])) lines.push(str(ho['호내용']));
      for (const mok of arr(ho['목'] as Json | Json[])) if (str(mok['목내용'])) lines.push(str(mok['목내용']));
    }
  }
  return { key, title: str(u['조문제목']) || undefined, text: lines.join('\n') };
}

let failed = false;
mkdirSync(join(root, 'law-texts'), { recursive: true });
for (const target of targets) {
  try {
    const instrument = /시행규칙$/.test(target) ? '시행규칙' : /시행령$/.test(target) ? '시행령' : '법';
    const name = target.replace(/\s*(시행령|시행규칙)$/, '').trim();
    const search = await getJson('lawSearch.do', { target: 'law', query: target, display: '20' });
    const found = arr((search['LawSearch'] as Json | undefined)?.['law'] as Json | Json[]).find(
      (l) => squash(str(l['법령명한글'])) === squash(target),
    );
    if (!found) throw new Error('검색 결과에서 같은 이름의 현행 법령을 찾지 못했습니다');
    const detail = await getJson('lawService.do', { target: 'law', MST: str(found['법령일련번호']) });
    const law = detail['법령'] as Json;
    const info = (law?.['기본정보'] ?? {}) as Json;
    const units = arr(((law?.['조문'] as Json | undefined)?.['조문단위']) as Json | Json[]);
    const articles: Record<string, { title?: string; text: string }> = {};
    for (const u of units) {
      const a = article(u);
      if (a) articles[a.key] = { ...(a.title ? { title: a.title } : {}), text: a.text };
    }
    const d = str(info['시행일자']);
    const file = {
      name,
      instrument,
      asOf: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : new Date().toISOString().slice(0, 10),
      source: `국가법령정보센터 Open API (법령일련번호 ${str(found['법령일련번호'])}, 시행일자 ${d})`,
      articles,
    };
    const out = join(root, 'law-texts', `${squash(name).replace(/[·ㆍ]/g, '')}-${instrument}.json`);
    writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
    console.log(`✓ ${target}: ${Object.keys(articles).length}개 조문 → ${out.replace(root, '')}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${target}: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
