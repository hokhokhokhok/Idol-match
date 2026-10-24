// 검수 표시: 문항 JSON을 손으로 고치지 않고 reviewed / 판례 verified 를 바꾼다.
//   npm run mark -- 2026-001-q03 2026-001-q04          문항 검수 완료(reviewed: true)
//   npm run mark -- 2026-001-q03 --undo                 검수 완료 취소
//   npm run mark -- 2026-001-q03 --case 1               그 문항의 1번째 판례 확인(verified: true)
//   npm run mark -- 2026-001-q03 --case 1 --citation "대법원 2000. 1. 1. 선고 99다00000 판결"
//   npm run mark -- 2026-001-q03 --past 2024:35:12 --kind 유사   기출 정보 기록(기출 원문과 대조 후, verified: true)
//                                        (연도:회차:번호, 회차·번호 생략 가능. kind: 기출|변형|유사, 기본 유사. --undo면 그 연도 기록 삭제)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Question } from '../src/types.ts';
import { validateSet } from '../src/lib/validate.ts';
import { validateConfig } from './validate-config.ts';
// 감관법: 반드시 law.go.kr 현행 조문과 대조한 뒤 표시한다

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const undo = args.includes('--undo');
const caseNo = opt('--case');
const past = opt('--past');
const kind = (opt('--kind') ?? '유사') as '기출' | '변형' | '유사';
const note = opt('--note');
const citation = opt('--citation');
const skip = new Set([caseNo, citation, past, opt('--kind'), note].filter(Boolean));
const ids = args.filter((a) => !a.startsWith('--') && !skip.has(a));
if (!ids.length) {
  console.error('사용법: npm run mark -- <문항id...> [--undo] [--case N [--citation "..."]] [--past 연도:회차:번호 [--kind 기출|변형|유사] [--note "..."]]');
  process.exit(1);
}

const bySet = new Map<string, string[]>();
for (const id of ids) {
  const setId = id.replace(/-q\d+$/, '');
  bySet.set(setId, [...(bySet.get(setId) ?? []), id]);
}

let failed = false;
for (const [setId, list] of bySet) {
  const file = join(root, 'src/data/sets', `${setId}.json`);
  const qs = JSON.parse(readFileSync(file, 'utf8')) as Question[];
  for (const id of list) {
    const q = qs.find((x) => x.id === id);
    if (!q) {
      console.error(`✗ ${id}: 문항을 찾을 수 없습니다`);
      failed = true;
      continue;
    }
    if (past) {
      const [year, round, number] = past.split(':').map((x) => (x ? Number(x) : undefined));
      if (!year || !['기출', '변형', '유사'].includes(kind)) {
        console.error(`✗ ${id}: --past 연도:회차:번호, --kind 기출|변형|유사 형식을 확인하세요`);
        failed = true;
        continue;
      }
      const rest = (q.pastExam ?? []).filter((r) => !(r.year === year && (number === undefined || r.number === number)));
      if (undo) {
        q.pastExam = rest.length ? rest : undefined;
      } else {
        const ref = { year, ...(round ? { round } : {}), ...(number ? { number } : {}), kind, verified: true, ...(note ? { note } : {}) };
        q.pastExam = [...rest, ref];
        if (kind === '기출') q.source = 'past';
      }
      if (!q.pastExam?.some((r) => r.kind === '기출')) q.source = 'original';
      if (!q.pastExam) delete q.pastExam;
      console.log(`${undo ? '↺' : '✓'} ${id} 기출 정보 ${undo ? '삭제' : '기록'}: ${past} (${kind})`);
    } else if (caseNo) {
      if (q.subject !== '민법') {
        console.error(`✗ ${id}: 판례 확인 표시는 민법 문항에만 있습니다`);
        failed = true;
        continue;
      }
      const c = q.explanation.cases?.[Number(caseNo) - 1];
      if (!c) {
        console.error(`✗ ${id}: 판례 ${caseNo}번이 없습니다 (판례 ${q.explanation.cases?.length ?? 0}개)`);
        failed = true;
        continue;
      }
      c.verified = !undo;
      if (citation) c.citation = citation;
      console.log(`${undo ? '↺' : '✓'} ${id} 판례 ${caseNo}: ${c.gist.slice(0, 40)}…`);
    } else {
      q.reviewed = !undo;
      console.log(`${undo ? '↺' : '✓'} ${id} ${undo ? '검수 취소' : '검수 완료'}`);
    }
  }
  const errors = validateSet(qs, setId, validateConfig).filter((i) => i.level === 'error');
  if (errors.length) {
    console.error(`✗ ${setId}: 검증 오류(계산 검증 실패 포함)가 있어 저장하지 않았습니다 — 검수 완료로 표시할 수 없습니다`, errors);
    failed = true;
    continue;
  }
  writeFileSync(file, JSON.stringify(qs, null, 2) + '\n');
  const done = qs.filter((q) => q.reviewed).length;
  const cases = qs.flatMap((q) => (q.subject === '민법' ? (q.explanation.cases ?? []) : []));
  const pastN = qs.filter((q) => q.pastExam?.length).length;
  console.log(`  ${setId}: 검수 ${done}/${qs.length}, 판례 확인 ${cases.filter((c) => c.verified).length}/${cases.length}, 기출 정보 ${pastN}문항`);
}
process.exit(failed ? 1 : 0);
