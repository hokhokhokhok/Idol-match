import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, plainText, type TableBlock } from './inline';

describe('parseInline', () => {
  it('plain text', () => {
    expect(parseInline('옳은 것은?')).toEqual([{ kind: 'text', text: '옳은 것은?' }]);
  });

  it('underline and bold', () => {
    expect(parseInline('<u>옳지 않은</u> 것은? **주의**')).toEqual([
      { kind: 'underline', children: [{ kind: 'text', text: '옳지 않은' }] },
      { kind: 'text', text: ' 것은? ' },
      { kind: 'bold', children: [{ kind: 'text', text: '주의' }] },
    ]);
  });

  it('nested markup', () => {
    expect(parseInline('**<u>아닌</u> 것**')).toEqual([
      {
        kind: 'bold',
        children: [
          { kind: 'underline', children: [{ kind: 'text', text: '아닌' }] },
          { kind: 'text', text: ' 것' },
        ],
      },
    ]);
  });

  it('leaves unmatched markers and other tags as literal text', () => {
    expect(parseInline('a ** b <u>c <b>d</b>')).toEqual([{ kind: 'text', text: 'a ** b <u>c <b>d</b>' }]);
  });
});

describe('parseBlocks (stem tables)', () => {
  const stem =
    '다음 표에 관한 설명으로 옳은 것은?\n\n<table><caption>건폐율</caption><thead><tr><th>용도지역</th><th>최대한도</th></tr></thead>' +
    '<tbody><tr><td>**일반상업지역**</td><td>80%</td></tr><tr><td colspan="2" onclick="x()">합계</td></tr></tbody></table>\n\n(조례는 고려하지 않음)';
  it('splits paragraphs and tables, keeping only colspan/rowspan', () => {
    const b = parseBlocks(stem);
    expect(b.map((x) => x.kind)).toEqual(['p', 'table', 'p']);
    const t = b[1] as TableBlock;
    expect(t.caption).toBe('건폐율');
    expect(t.head).toEqual([[{ header: true, text: '용도지역' }, { header: true, text: '최대한도' }].map((c) => ({ ...c, colSpan: undefined, rowSpan: undefined }))]);
    expect(t.body[0][0].text).toBe('**일반상업지역**');
    expect(t.body[1][0]).toEqual({ header: false, text: '합계', colSpan: 2, rowSpan: undefined });
  });
  it('plain text replaces tables', () => {
    expect(plainText(stem)).toBe('다음 표에 관한 설명으로 옳은 것은? [표] (조례는 고려하지 않음)');
  });
});
