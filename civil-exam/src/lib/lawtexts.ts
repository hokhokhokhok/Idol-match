import { parseCite, type ParsedCite } from './law';
import type { Instrument } from '../types';

/**
 * 조문 원문 (1차: 수동 JSON). law-texts/*.json 에 사용자가 국가법령정보센터에서 복사한 조문을 넣거나
 * `npm run fetch-law`(법제처 Open API, 키 필요)로 받아 둔다. 빌드에 포함되어 오프라인에서도 보인다.
 * 파일 이름이 _로 시작하면(예: _template.json) 읽지 않는다.
 */
export type LawTextFile = {
  /** 정식 법률명 (시행령·시행규칙 제외) */
  name: string;
  instrument: Instrument;
  /** 이 시점의 현행 조문 */
  asOf?: string;
  source?: string;
  /** "제84조" → 조문 */
  articles: Record<string, { title?: string; text: string }>;
};

const modules = import.meta.glob<LawTextFile>(['../../law-texts/*.json', '!../../law-texts/_*.json'], {
  eager: true,
  import: 'default',
});

const squash = (s: string) => s.replace(/\s+/g, '');
export const lawTexts: LawTextFile[] = Object.values(modules).filter((f) => f && f.name && f.articles);

export type ArticleHit = { file: LawTextFile; article: string; title?: string; text: string };

export function findArticle(p: ParsedCite | null, files: LawTextFile[] = lawTexts): ArticleHit | null {
  if (!p?.article) return null;
  const file = files.find((f) => squash(f.name) === squash(p.name) && f.instrument === p.instrument);
  const a = file?.articles[p.article];
  return file && a ? { file, article: p.article, title: a.title, text: a.text } : null;
}

export const lookupCite = (cite: string) => {
  const parsed = parseCite(cite);
  return { parsed, hit: findArticle(parsed) };
};
