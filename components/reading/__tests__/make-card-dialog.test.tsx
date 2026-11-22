import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue?: string; defaultValue_other?: string; [k: string]: unknown }) =>
      (o.defaultValue ?? o.defaultValue_other ?? '').replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));

import { CardStepForm, type CardSource } from '../MakeCardDialog';

/** The one primary button, switched off. */
const PRIMARY_OFF = /data-variant="primary"[^>]*disabled=""/;

const source = (exact: string, note: string | null = null): CardSource => ({
  id: 'h1',
  exact,
  note,
  title: 'On Tides',
});

const render = (props: Partial<Parameters<typeof CardStepForm>[0]> & { source: CardSource }) =>
  renderToStaticMarkup(
    <CardStepForm canChooseShape submitLabel="Add card" deckReady busy={false} onSubmit={() => {}} {...props} />,
  );

describe('MakeCardDialog form', () => {
  it('renders the question and passage shape: a question field prefilled from the note, the passage, the primary button', () => {
    const html = render({ source: source('The tide pulls twice daily.', 'Why two tides?') });
    expect(html).toContain('Question and passage');
    expect(html).toContain('Fill in the blank');
    expect(html).toContain('Why two tides?');
    expect(html).toContain('The tide pulls twice daily.');
    expect(html).toContain('27 of 500 characters');
    expect(html).toContain('Add card');
    // The word picker belongs to the other shape.
    expect(html).not.toContain('aria-pressed');
  });

  it('renders the fill-in-the-blank shape with a toggle button per word, none pressed', () => {
    const html = render({ source: source('The tide pulls twice daily.'), initialShape: 'cloze' });
    expect(html).toContain('Choose up to 5 words to blank');
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(5);
    expect(html).toContain('0 blanks, one card each');
    // No question field on a cloze card, and no blank yet, so no card to add.
    expect(html).not.toContain('What does this passage answer?');
    expect(html).toMatch(PRIMARY_OFF);
  });

  it('gives the member`s passage its own text direction', () => {
    expect(render({ source: source('مرحبا بالعالم') })).toContain('dir="auto"');
  });

  it('refuses a passage over the limit and shows the count', () => {
    const html = render({ source: source('x '.repeat(300).trim(), 'Q') });
    expect(html).toContain('Too long: 599 of 500 characters. Trim the passage.');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(PRIMARY_OFF);
  });

  it('allows the same passage as a cloze card, whose limit is 1,000', () => {
    const html = render({ source: source('x '.repeat(300).trim()), initialShape: 'cloze' });
    expect(html).toContain('599 of 1000 characters');
    expect(html).not.toContain('Too long');
  });

  it('offers Skip only in a step-through, and no shape tabs there', () => {
    const html = render({
      source: source('A passage.'),
      canChooseShape: false,
      onSkip: () => {},
      submitLabel: 'Next card',
    });
    expect(html).toContain('Skip');
    expect(html).toContain('Next card');
    expect(html).not.toContain('Fill in the blank');
  });

  it('keeps the primary button off until a deck is chosen', () => {
    const html = render({ source: source('A passage.', 'Q'), deckReady: false });
    expect(html).toMatch(PRIMARY_OFF);
  });
});
