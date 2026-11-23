import { describe, expect, it } from 'vitest';
import { PROMPT_MAX, PROMPT_MIN, scrubForumPrompt } from './scrub';

const HANDLES = ['PreMedPete'];

describe('scrubForumPrompt: rejects, never redacts', () => {
  it.each([
    ['an email', 'Email your essay to admissions@school.edu before the deadline.'],
    ['an https URL', 'Describe your goals, see https://school.edu/secondary for details.'],
    ['a www URL', 'Describe your goals, see www.school.edu/secondary for details.'],
    ['an @name', 'Describe a challenge you faced, thanks @someuser for sharing.'],
    ['a phone number', 'Questions about this prompt? Call 555-123-4567 for details.'],
    ['an honorific and a name', 'Describe a time you worked with Dr. Smith on research.'],
    ['a page handle', 'PreMedPete posted this: describe a challenge you faced.'],
    ['a first-person narrative', 'I wrote about my grandmother and they asked why.'],
    ['a first-person contraction', "I'm still waiting on this one, describe a challenge."],
    ['a possessive', 'my answer was 250 words for the diversity question'],
    ['a quote marker', '> Why are you interested in our school?'],
    ['a said: attribution', 'John said: Why are you interested in our school?'],
    ['a quote tag', '[quote="Name"]Why are you interested in our school?[/quote]'],
    ['too short', 'Why us?'],
    ['too long', `Describe ${'a very long challenge '.repeat(40)}`],
    ['shouting', 'DESCRIBE A CHALLENGE YOU FACED AND HOW YOU RESPONDED'],
  ])('rejects %s', (_name, text) => {
    expect(scrubForumPrompt(text, HANDLES)).toBeNull();
  });

  it.each([
    ['Describe a time you faced adversity and how you responded.'],
    ['Why are you interested in our school? (250 words)'],
    ['Please describe your activities since graduation.'],
    ['In your own words, tell us how you would use your experiences in our class.'],
  ])('accepts %s', (text) => {
    expect(scrubForumPrompt(text, HANDLES)).toBe(text);
  });

  it('returns the text single-spaced and trimmed', () => {
    expect(scrubForumPrompt('  Describe  a time you\n faced adversity.  ', [])).toBe(
      'Describe a time you faced adversity.',
    );
  });

  it('second person is the normal case, and a handle check accepts a closure', () => {
    expect(scrubForumPrompt('What would you bring to your class and your community?', [])).not.toBeNull();
    expect(
      scrubForumPrompt('Describe a challenge you faced, Xavier.', {
        containsHandle: (t: string) => t.includes('Xavier'),
      }),
    ).toBeNull();
  });

  it('keeps the bounds it documents', () => {
    expect(PROMPT_MIN).toBe(20);
    expect(PROMPT_MAX).toBe(600);
  });
});
