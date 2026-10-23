// 검수용 시트: 세트를 사람이 읽기 좋은 마크다운으로 뽑는다 (정답·보기별 해설·조문·판례 포함)
//   npm run review-sheet -- 2026-001            → docs/review/2026-001.md
//   npm run review-sheet -- 2026-001 --stdout   → 화면 출력
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Question } from '../src/types.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const setId = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!setId) {
  console.error('사용법: npm run review-sheet -- <세트id>');
  process.exit(1);
}
const qs = JSON.parse(readFileSync(join(root, 'src/data/sets', `${setId}.json`), 'utf8')) as Question[];
const C = ['①', '②', '③', '④', '⑤'];
const TYPE = { single: '단일', count: '개수', combo: '조합', case: '사례', precedent: '판례', numeric: '숫자·기간' } as const;
const law = qs[0]?.subject === '감관법';
const casesOf = (q: Question) => (q.subject === '민법' ? (q.explanation.cases ?? []) : []);
/** 표 지문을 마크다운 표로 */
const tableToMd = (t: string) => {
  const rows = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => c[2].replace(/\s+/g, ' ').trim()),
  );
  if (!rows.length) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(w - r.length).fill('')].join(' | ')} |`;
  return [line(rows[0]), line(Array(w).fill('---')), ...rows.slice(1).map(line)].join('\n');
};
const plain = (s: string) => s.replace(/<u>(.*?)<\/u>/g, '__$1__');

const out: string[] = [
  `# ${setId} 검수 시트`,
  '',
  law
    ? `${qs.length}문항 · 검수 완료 ${qs.filter((q) => q.reviewed).length} · 개정 위험(volatile) ${qs.filter((q) => q.subject === '감관법' && q.volatile).length} · 기준 법령 ${[...new Set(qs.map((q) => (q.subject === '감관법' ? q.lawAsOf : '')))].join(', ')}`
    : `${qs.length}문항 · 검수 완료 ${qs.filter((q) => q.reviewed).length} · 판례 확인 ${qs.flatMap(casesOf).filter((c) => c.verified).length}/${qs.flatMap(casesOf).length}`,
  '',
  ...(law
    ? [
        '문항마다 아래를 확인한 뒤 `npm run mark -- <문항id>`로 검수 완료 표시한다. **감관법은 수치·기간·조문 번호를 AI가 그럴듯하게 틀리기 쉽다.**',
        '',
        '- 정답이 **하나뿐**인가 (다른 보기도 옳다/틀리다고 다툴 여지가 없는가)',
        '- 보기별 해설의 옳고 그름이 정답과 맞는가',
        '- 근거 조문(법·시행령·시행규칙)의 **조문 번호와 내용**을 국가법령정보센터(law.go.kr) 현행 법령과 대조했는가',
        '- 수치·기간·비율·금액이 기준일 현행 법령과 같은가 (volatile 문항은 특히)',
        '- 시험 공고일 전 개정 예정(시행일 확인)이 없는가',
        '',
      ]
    : [
        '문항마다 아래를 확인한 뒤 `npm run mark -- <문항id>`로 검수 완료 표시, 판례는 `npm run mark -- <문항id> --case <번호>`로 확인 표시한다.',
        '',
        '- 정답이 **하나뿐**인가 (다른 보기도 옳다/틀리다고 다툴 여지가 없는가)',
        '- 보기별 해설의 옳고 그름이 정답과 맞는가',
        '- 근거 조문을 국가법령정보센터(law.go.kr) 현행 민법과 대조했는가',
        '- 판례 취지를 대법원 종합법률정보(glaw.scourt.go.kr)에서 확인했는가',
        '',
      ]),
];
for (const q of qs) {
  const cat = q.subject === '감관법' ? q.law : q.unit;
  const flags = q.subject === '감관법' ? `${q.volatile ? ' · ⚠ 개정 위험' : ''} · 기준 ${q.lawAsOf}` : '';
  out.push(`---`, '', `## ${q.number}. [${cat} · ${q.topic} · ${TYPE[q.type]}형 · 난이도 ${q.difficulty}${flags}] \`${q.id}\`${q.reviewed ? ' ✅ 검수 완료' : ''}`, '');
  out.push(plain(q.stem.replace(/<table\b[\s\S]*?<\/table>/g, (t) => '\n' + tableToMd(t) + '\n')), '');
  if (q.box) {
    out.push(`> <${q.box.title ?? '보 기'}>`);
    for (const it of q.box.items) out.push(`> ${it.label}. ${plain(it.text)}  `);
    out.push('');
  }
  q.choices.forEach((c, i) => out.push(`${C[i]} ${plain(c)}  `));
  out.push('', `**정답 ${C[q.answer - 1]}** — ${q.explanation.summary}`, '');
  q.explanation.perChoice.forEach((p, i) => out.push(`- ${C[i]}${i + 1 === q.answer ? ' (정답)' : ''} ${p}`));
  if (q.subject === '감관법') {
    out.push('', '근거 조문 (law.go.kr에서 대조):');
    for (const b of q.explanation.legalBasis) out.push(`- [ ] [${b.instrument}] ${b.cite}`);
  } else out.push('', `조문: ${q.explanation.statutes.join(', ') || '없음'}`);
  casesOf(q).forEach((c, i) =>
    out.push(`- 판례 ${i + 1} ${c.verified ? '✅' : '☐ 확인 필요'}: ${c.gist}${c.citation ? ` (${c.citation})` : ''}`),
  );
  out.push('', `- [${q.reviewed ? 'x' : ' '}] 검수 완료`, '');
}
const md = out.join('\n');
if (process.argv.includes('--stdout')) console.log(md);
else {
  const dir = join(root, 'docs/review');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${setId}.md`), md);
  console.log(`docs/review/${setId}.md 작성 (${qs.length}문항)`);
}
