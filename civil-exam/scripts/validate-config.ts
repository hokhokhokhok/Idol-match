// 검증 설정(배분·분량 기준, 풀이 함수, KaTeX 수식 검사)을 한 곳에서 만든다 — validate-questions·mark가 함께 쓴다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { solvers } from '../src/solvers/index.ts';
import type { Blueprint, ValidateConfig } from '../src/lib/validate.ts';

export const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = <T,>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;

/** KaTeX가 그릴 수 없는 수식이면 그 이유 */
export function parseMath(tex: string): string | null {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });
    return null;
  } catch (e) {
    return (e as Error).message.replace(/^KaTeX parse error: /, '');
  }
}

export const lawBlueprint = readJson<Blueprint>('config/law/blueprint.json');
export const econBlueprint = readJson<Blueprint>('config/econ/blueprint.json');
export const reBlueprint = readJson<Blueprint>('config/realestate/blueprint.json');

export const validateConfig: ValidateConfig = {
  blueprints: { 민법: readJson<Blueprint>('config/blueprint.json'), 감관법: lawBlueprint, 경제학원론: econBlueprint, 부동산학원론: reBlueprint },
  lawLength: readJson<ValidateConfig['lawLength']>('config/law/length.json'),
  lawAsOf: readJson<{ lawAsOf: string }>('config/law/exam.json').lawAsOf,
  econLength: readJson<ValidateConfig['econLength']>('config/econ/length.json'),
  reLength: readJson<ValidateConfig['reLength']>('config/realestate/length.json'),
  solvers,
  parseMath,
};
