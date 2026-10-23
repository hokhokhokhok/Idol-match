// 문항 세트 검증 CLI
//   npm run validate                    src/data/sets/*.json 전체
//   npm run validate -- 파일.json ...    지정한 파일만
//   --strict  분량·구성 경고도 실패로 처리   --quiet  info 숨김   --json  결과를 JSON으로
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { crossSetIssues, econCoverage, lawCoverage, validateSet, type Issue } from '../src/lib/validate.ts';
import { econBlueprint, lawBlueprint, root, validateConfig as cfg } from './validate-config.ts';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const quiet = args.includes('--quiet');
const asJson = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));
const setsDir = join(root, 'src/data/sets');
const targets = files.length
  ? files
  : readdirSync(setsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(setsDir, f));

const sets: { setId: string; questions: unknown }[] = [];
const issues: Issue[] = [];
for (const file of targets) {
  const setId = basename(file).replace(/\.json$/, '');
  let questions: unknown;
  try {
    questions = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    issues.push({ level: 'error', where: setId, message: `JSON을 읽을 수 없습니다: ${(e as Error).message}` });
    continue;
  }
  sets.push({ setId, questions });
  issues.push(...validateSet(questions, setId, cfg));
}
issues.push(...crossSetIssues(sets));
if (!files.length) issues.push(...lawCoverage(sets, lawBlueprint), ...econCoverage(sets, econBlueprint));

const count = (l: Issue['level']) => issues.filter((i) => i.level === l).length;
const errors = count('error');
const warns = count('warn');
const failed = errors > 0 || (strict && warns > 0);

if (asJson) {
  console.log(JSON.stringify({ ok: !failed, errors, warnings: warns, issues }, null, 2));
} else {
  const icon = { error: '✗', warn: '△', info: '·' } as const;
  const shown = issues.filter((i) => !(quiet && i.level === 'info'));
  let last = '';
  for (const i of shown) {
    if (i.where !== last) console.log(`\n${i.where}`);
    last = i.where;
    console.log(`  ${icon[i.level]} ${i.message}`);
  }
  const qCount = sets.reduce((n, s) => n + (Array.isArray(s.questions) ? s.questions.length : 0), 0);
  console.log(
    `\n${targets.length}개 세트 · ${qCount}문항 — 오류 ${errors}, 경고 ${warns}, 참고 ${count('info')}` +
      (failed ? '  → 실패' : '  → 통과') +
      (strict ? ' (--strict)' : ''),
  );
}
process.exit(failed ? 1 : 0);
