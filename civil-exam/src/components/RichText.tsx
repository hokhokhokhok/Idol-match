import katex from 'katex';
import { Fragment, useMemo } from 'react';
import { parseInline, type InlineNode } from '../lib/inline';

const mathCache = new Map<string, string>();
/** KaTeX → HTML (오류가 나도 앱이 멈추지 않게 원문을 빨간 글씨로 보여 준다. 검증 스크립트가 미리 잡는다) */
function mathHtml(tex: string, display: boolean) {
  const key = `${display ? 'D' : 'I'}${tex}`;
  let html = mathCache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' });
    mathCache.set(key, html);
  }
  return html;
}

function render(nodes: InlineNode[]) {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === 'math') {
      // KaTeX 출력(trust: false)만 주입한다 — 문항 텍스트의 HTML은 여전히 주입하지 않는다
      const Tag = n.display ? 'div' : 'span';
      return <Tag key={i} className={n.display ? 'math math-block' : 'math'} dangerouslySetInnerHTML={{ __html: mathHtml(n.tex, n.display) }} />;
    }
    const Tag = n.kind === 'bold' ? 'strong' : 'u';
    return <Tag key={i}>{render(n.children)}</Tag>;
  });
}

/** **굵게**, <u>밑줄</u>, $수식$ 만 해석하는 문항 텍스트 렌더러 */
export function RichText({ text }: { text: string }) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <>{render(nodes)}</>;
}
