import { describe, it, expect } from 'vitest';
import { dropDuplicateNodes } from '../dedupe';
import type { GenScene } from '../world-types';

function scene(id: string, nodes: { text: string; choices?: unknown[] }[]): GenScene {
  return {
    id, environment: 'cafe', timeOfDay: 'morning', charactersPresent: ['c1'],
    nodes: nodes.map((n, i) => ({
      id: `${id}_n${i}`, speaker: null, text: n.text,
      ...(n.choices ? { choices: n.choices } : {}),
    })),
  } as GenScene;
}

describe('dropDuplicateNodes', () => {
  it('drops a later node that exactly repeats an earlier one', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'The rain falls.' }, { text: 'She smiles.' }, { text: 'the rain falls' },
    ])]);
    expect(out[0].nodes.map(n => n.text)).toEqual(['The rain falls.', 'She smiles.']);
  });

  it('treats punctuation/case/whitespace differences as duplicates', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'You came back.' }, { text: 'you  came   back!!!' },
    ])]);
    expect(out[0].nodes).toHaveLength(1);
  });

  it('dedupes across scenes', () => {
    const out = dropDuplicateNodes([
      scene('s0', [{ text: 'A whole line here.' }]),
      scene('s1', [{ text: 'a whole line here' }, { text: 'Something genuinely new.' }]),
    ]);
    expect(out[1].nodes.map(n => n.text)).toEqual(['Something genuinely new.']);
  });

  it('never drops a choice node even if its text repeats', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'Make your choice now.' }, { text: 'make your choice now', choices: [{ text: 'a' }] },
    ])]);
    expect(out[0].nodes).toHaveLength(2);
  });

  it('keeps repeated short reactive lines (<=3 words)', () => {
    const out = dropDuplicateNodes([scene('s0', [
      { text: 'I know.' }, { text: 'She looked away.' }, { text: 'I know.' },
    ])]);
    expect(out[0].nodes).toHaveLength(3);
  });

  it('keeps the first node when a scene would otherwise go empty', () => {
    const out = dropDuplicateNodes([
      scene('s0', [{ text: 'The same long line.' }]),
      scene('s1', [{ text: 'the same long line' }]),
    ]);
    expect(out[1].nodes).toHaveLength(1);
    expect(out[1].nodes[0].text).toBe('the same long line');
  });
});
