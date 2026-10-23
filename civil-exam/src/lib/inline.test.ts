import { describe, expect, it } from 'vitest';
import { parseInline } from './inline';

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
