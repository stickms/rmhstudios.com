import { describe, expect, it } from 'vitest';
import { noticeText } from '@/components/feed/notice-previews';

/** The previews of the sprint 12 (19) notices: the frame in the reader's language, member and admin words as written. */

const es: Record<string, string> = {
  'notice-api-key-suspended': 'Tu clave de API {{name}} fue suspendida: {{reason}}',
  'notice-ladder-interview': 'Entrevista para {{title}} en {{company}}: {{interviewAt}}.',
};
const t = ((key: string, o: Record<string, string>) =>
  (es[key] ?? o.defaultValue!).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => o[k] ?? '')) as never;
const same = (iso: string) => iso;

describe('helper notice previews', () => {
  it('translates the frame of an API key suspension and keeps the admin words', () => {
    expect(noticeText(t, 'api-key-suspended', { name: 'bot', reason: 'scraping every profile' }, same)).toBe(
      'Tu clave de API ⁨bot⁩ fue suspendida: ⁨scraping every profile⁩',
    );
  });

  it('formats a ladder interview time through the reader formatter', () => {
    expect(
      noticeText(
        t,
        'ladder-interview',
        { title: 'Analyst', company: 'Acme', interviewAt: '2026-11-26T14:00:00.000Z' },
        (iso) => `<${iso}>`,
      ),
    ).toBe('Entrevista para ⁨Analyst⁩ en ⁨Acme⁩: <2026-11-26T14:00:00.000Z>.');
  });

  it('fills the report decision and the recipe frame with the quoted words', () => {
    expect(noticeText(t, 'report-decision', { message: 'It broke rule 2.' }, same)).toBe(
      'A moderator reviewed a report about your content: ⁨It broke rule 2.⁩',
    );
    expect(noticeText(t, 'recipe-message', { recipe: 'PB alert', message: 'New best!' }, same)).toBe(
      '⁨PB alert⁩: ⁨New best!⁩',
    );
  });

  it('names the kind of report in an admin review alert, and shows an unknown kind as written', () => {
    expect(noticeText(t, 'admin-review-report', { kind: 'rmhark' }, same)).toBe('New ⁨Post⁩ report needs review');
    expect(noticeText(t, 'admin-review-automod', { kind: 'gadget', category: 'SPAM' }, same)).toBe(
      'Automated screening flagged a ⁨gadget⁩ (⁨SPAM⁩)',
    );
  });
});
