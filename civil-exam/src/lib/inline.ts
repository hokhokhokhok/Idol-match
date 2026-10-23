/**
 * 문항 텍스트의 제한된 인라인 마크업 파서. 지원: **굵게**, <u>밑줄</u> (중첩 가능),
 * 수식 $…$(인라인)·$$…$$(블록) — 수식 안은 다른 마크업으로 해석하지 않고 KaTeX가 그린다.
 * HTML을 그대로 주입하지 않도록 트리로 바꿔 React가 렌더링하게 한다.
 * 짝이 맞지 않는 표식은 일반 문자로 남긴다.
 */
export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'math'; tex: string; display: boolean }
  | { kind: 'bold' | 'underline'; children: InlineNode[] };

const MARKERS = [
  { open: '**', close: '**', kind: 'bold' },
  { open: '<u>', close: '</u>', kind: 'underline' },
] as const;

export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i - 1] !== '\\') {
      const display = src.startsWith('$$', i);
      const delim = display ? '$$' : '$';
      const end = src.indexOf(delim, i + delim.length);
      if (end > i + delim.length) {
        if (buf) out.push({ kind: 'text', text: buf });
        buf = '';
        out.push({ kind: 'math', tex: src.slice(i + delim.length, end).trim(), display });
        i = end + delim.length;
        continue;
      }
    }
    const m = MARKERS.find((mk) => src.startsWith(mk.open, i));
    const end = m ? src.indexOf(m.close, i + m.open.length) : -1;
    if (m && end > i + m.open.length) {
      if (buf) out.push({ kind: 'text', text: buf });
      buf = '';
      out.push({ kind: m.kind, children: parseInline(src.slice(i + m.open.length, end)) });
      i = end + m.close.length;
    } else {
      buf += src[i];
      i += 1;
    }
  }
  if (buf) out.push({ kind: 'text', text: buf });
  return out;
}

/* ---------- 지문 블록: 문단(빈 줄로 구분)과 표(<table>) ---------- */

export type TableCell = { header: boolean; text: string; colSpan?: number; rowSpan?: number };
export type TableBlock = { kind: 'table'; caption?: string; head: TableCell[][]; body: TableCell[][] };
export type Block = { kind: 'p'; text: string } | TableBlock;

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/g;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const CELL_RE = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g;

const span = (attrs: string, name: string) => {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'));
  const n = m ? Number(m[1]) : 1;
  return n > 1 ? n : undefined;
};

function rows(html: string): TableCell[][] {
  return [...html.matchAll(ROW_RE)].map((r) =>
    [...r[1].matchAll(CELL_RE)].map((c) => ({
      header: c[1] === 'th',
      text: c[3].replace(/\s+/g, ' ').trim(),
      colSpan: span(c[2], 'colspan'),
      rowSpan: span(c[2], 'rowspan'),
    })),
  );
}

/** 표 HTML(허용 태그: table, caption, thead, tbody, tr, th, td + colspan/rowspan)을 구조로 바꾼다. 그 밖의 속성은 버린다 */
export function parseTable(inner: string): TableBlock {
  const caption = inner.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/)?.[1].trim();
  const thead = inner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1];
  const rest = inner.replace(/<caption\b[^>]*>[\s\S]*?<\/caption>/, '').replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/, '');
  return { kind: 'table', ...(caption ? { caption } : {}), head: thead ? rows(thead) : [], body: rows(rest) };
}

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  const paras = (s: string) =>
    s
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((text) => out.push({ kind: 'p', text }));
  let last = 0;
  for (const m of src.matchAll(TABLE_RE)) {
    paras(src.slice(last, m.index));
    out.push(parseTable(m[1]));
    last = m.index! + m[0].length;
  }
  paras(src.slice(last));
  return out;
}

const plainInline = (nodes: InlineNode[]): string =>
  nodes.map((n) => (n.kind === 'text' ? n.text : n.kind === 'math' ? n.tex : plainInline(n.children))).join('');

/** 텍스트 속 수식(TeX) 목록 — 검증 스크립트가 KaTeX로 파싱해 본다 */
export const mathOf = (src: string): string[] => {
  const walk = (ns: InlineNode[]): string[] =>
    ns.flatMap((n) => (n.kind === 'math' ? [n.tex] : n.kind === 'text' ? [] : walk(n.children)));
  return walk(parseInline(src));
};

/** 목록 미리보기용 순수 텍스트: 마크업 제거, 표는 [표] */
export const plainText = (src: string) =>
  plainInline(parseInline(src.replace(TABLE_RE, ' [표] ')))
    .replace(/\s+/g, ' ')
    .trim();
