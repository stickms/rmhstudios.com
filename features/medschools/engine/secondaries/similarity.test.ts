import { describe, expect, it } from 'vitest';
import { SIM_MIN_WORDS, SIM_REWORDED, contentWords, isReworded, matchPrompts, similarity } from './similarity';

const DIVERSITY_A = 'Describe how your background and experiences would contribute to the diversity of our class.';
const CHALLENGE_A = 'Describe a challenge you have faced and how you overcame it.';

describe('similarity', () => {
  it('keeps the documented constants', () => {
    expect(SIM_REWORDED).toBe(0.5);
    expect(SIM_MIN_WORDS).toBe(3);
  });

  it('is 1 for identical text, 0 for nothing in common, and symmetric', () => {
    expect(similarity(CHALLENGE_A, CHALLENGE_A)).toBe(1);
    expect(similarity(CHALLENGE_A, 'Why are you interested in our medical school?')).toBe(0);
    const a = 'Describe your research experience.';
    const b = 'Describe your research experience and what you learned.';
    expect(similarity(a, b)).toBe(similarity(b, a));
  });

  it('scores 0 for a prompt with fewer than three content words', () => {
    expect(similarity('Why medicine?', 'Why medicine?')).toBe(0);
    expect(similarity('Why medicine?', 'Why do you want to practice medicine in our community?')).toBe(0);
  });

  it('stems lightly: faced and face are one word', () => {
    expect(contentWords('faced')).toEqual(contentWords('face'));
    expect(contentWords('You have faced experiences')).toEqual(['fac', 'experienc']);
  });

  it.each([
    [CHALLENGE_A, 'Tell us about a challenge you faced and how you overcame it.'],
    [DIVERSITY_A, 'How would your experiences contribute to diversity in our entering class?'],
    ['Describe your research experience.', 'Describe your research experience and what you learned.'],
  ])('reads %j as reworded', (a, b) => {
    expect(isReworded(a, b)).toBe(true);
  });

  it.each([
    ['Why are you interested in our medical school?', CHALLENGE_A],
    ['Describe your research experience.', 'Why are you interested in our school?'],
    [DIVERSITY_A, 'Describe a time you faced adversity.'],
  ])('does not read %j and %j as reworded', (a, b) => {
    expect(isReworded(a, b)).toBe(false);
  });

  it('two documented near-misses stay below the line on purpose (do not retune the threshold)', () => {
    expect(
      similarity(
        'Discuss a significant ethical dilemma you encountered.',
        'Describe an ethical dilemma you have faced and how you resolved it.',
      ),
    ).toBeLessThan(SIM_REWORDED);
    expect(
      similarity('Why are you interested in our medical school?', 'Why do you want to attend our school?'),
    ).toBeLessThan(SIM_REWORDED);
  });
});

describe('matchPrompts', () => {
  it('pairs one-to-one: two newer prompts that resemble one older prompt, only the better one pairs', () => {
    const older = [{ id: 'o1', text: 'Describe your research experience and what you learned.' }];
    const newer = [
      { id: 'n1', text: 'Describe your research experience and what you learned from it.' },
      { id: 'n2', text: 'Describe your research experience.' },
    ];
    const m = matchPrompts(older, newer);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ olderId: 'o1', newerId: 'n1' });
  });

  it('breaks ties by id, whatever the input order', () => {
    const t = 'Describe your research experience and what you learned.';
    const a = matchPrompts(
      [{ id: 'o1', text: t }],
      [
        { id: 'n2', text: t },
        { id: 'n1', text: t },
      ],
    );
    const b = matchPrompts(
      [{ id: 'o1', text: t }],
      [
        { id: 'n1', text: t },
        { id: 'n2', text: t },
      ],
    );
    expect(a).toEqual(b);
    expect(a[0]?.newerId).toBe('n1');
  });

  it('matches several pairs and ignores weak ones; empty input gives nothing', () => {
    const older = [
      { id: 'o1', text: CHALLENGE_A },
      { id: 'o2', text: 'Why are you interested in our medical school?' },
    ];
    const newer = [{ id: 'n1', text: 'Tell us about a challenge you faced and how you overcame it.' }];
    expect(matchPrompts(older, newer).map((p) => [p.olderId, p.newerId])).toEqual([['o1', 'n1']]);
    expect(matchPrompts([], newer)).toEqual([]);
    expect(matchPrompts(older, [])).toEqual([]);
  });
});
