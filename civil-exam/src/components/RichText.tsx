import { Fragment, useMemo } from 'react';
import { parseInline, type InlineNode } from '../lib/inline';

function render(nodes: InlineNode[]) {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    const Tag = n.kind === 'bold' ? 'strong' : 'u';
    return <Tag key={i}>{render(n.children)}</Tag>;
  });
}

/** **굵게**, <u>밑줄</u> 만 해석하는 문항 텍스트 렌더러 */
export function RichText({ text }: { text: string }) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <>{render(nodes)}</>;
}
