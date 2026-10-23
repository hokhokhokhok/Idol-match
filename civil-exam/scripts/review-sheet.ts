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
const TYPE = { single: '단일', count: '개수', combo: '조합', case: '사례', precedent: '판례' } as const;
const plain = (s: string) => s.replace(/<u>(.*?)<\/u>/g, '__$1__');

const out: string[] = [
  `# ${setId} 검수 시트`,
  '',
  `${qs.length}문항 · 검수 완료 ${qs.filter((q) => q.reviewed).length} · 판례 확인 ${qs.flatMap((q) => q.explanation.cases ?? []).filter((c) => c.verified).length}/${qs.flatMap((q) => q.explanation.cases ?? []).length}`,
  '',
  '문항마다 아래를 확인한 뒤 `npm run mark -- <문항id>`로 검수 완료 표시, 판례는 `npm run mark -- <문항id> --case <번호>`로 확인 표시한다.',
  '',
  '- 정답이 **하나뿐**인가 (다른 보기도 옳다/틀리다고 다툴 여지가 없는가)',
  '- 보기별 해설의 옳고 그름이 정답과 맞는가',
  '- 근거 조문을 국가법령정보센터(law.go.kr) 현행 민법과 대조했는가',
  '- 판례 취지를 대법원 종합법률정보(glaw.scourt.go.kr)에서 확인했는가',
  '',
];
for (const q of qs) {
  out.push(`---`, '', `## ${q.number}. [${q.unit} · ${q.topic} · ${TYPE[q.type]}형 · 난이도 ${q.difficulty}] \`${q.id}\`${q.reviewed ? ' ✅ 검수 완료' : ''}`, '');
  out.push(plain(q.stem), '');
  if (q.box) {
    out.push(`> <${q.box.title ?? '보 기'}>`);
    for (const it of q.box.items) out.push(`> ${it.label}. ${plain(it.text)}  `);
    out.push('');
  }
  q.choices.forEach((c, i) => out.push(`${C[i]} ${plain(c)}  `));
  out.push('', `**정답 ${C[q.answer - 1]}** — ${q.explanation.summary}`, '');
  q.explanation.perChoice.forEach((p, i) => out.push(`- ${C[i]}${i + 1 === q.answer ? ' (정답)' : ''} ${p}`));
  out.push('', `조문: ${q.explanation.statutes.join(', ') || '없음'}`);
  (q.explanation.cases ?? []).forEach((c, i) =>
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
