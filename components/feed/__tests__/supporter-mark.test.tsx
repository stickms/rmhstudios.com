/**
 * Supporter marks in the UI (sprint 14 #13): a reply from an active supporter carries the word "Supporter" after the
 * name, in the creator's view only; the Creator section of the profile editor has the switch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));
vi.mock('@/components/feed/SpotifySongSearch', () => ({ SpotifySongSearch: () => null }));
vi.mock('../SpotifySongSearch', () => ({ SpotifySongSearch: () => null }));

const { SupporterMark } = await import('../SupporterMark');
const { CreatorSection } = await import('../profile-edit/CreatorSection');
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('SupporterMark', () => {
  const out = renderToStaticMarkup(createElement(SupporterMark));

  it('is the word, in t-meta, with no icon', () => {
    expect(out).toContain('Supporter');
    expect(out).toContain('class="t-meta"');
    expect(out).not.toContain('<svg');
  });
});

describe('CommentItem', () => {
  const src = read('components/feed/CommentItem.tsx');

  it('renders the mark only for a reply the server marked', () => {
    expect(src).toContain('{comment.supporter ? <SupporterMark /> : null}');
  });

  it('types the field as optional and only ever true', () => {
    expect(src).toMatch(/supporter\?: true;/);
  });
});

describe('Creator section switch', () => {
  const form = {
    tipGoal: '',
    setTipGoal: () => {},
    membershipPrice: '',
    setMembershipPrice: () => {},
    tipGoalLabel: '',
    setTipGoalLabel: () => {},
    selectedSong: null,
    setSelectedSong: () => {},
    showSupporterMarks: true,
    setShowSupporterMarks: () => {},
  };
  const render = (on: boolean) =>
    renderToStaticMarkup(
      createElement(CreatorSection, { form: { ...form, showSupporterMarks: on }, onOpenCosmetics: () => {} }),
    );

  it('labels the switch and reflects its state', () => {
    const on = render(true);
    expect(on).toContain('Show supporter marks on replies');
    expect(on).toMatch(
      /role="switch"[^>]*aria-checked="true"[^>]*id="profile-supporter-marks"|id="profile-supporter-marks"[^>]*aria-checked="true"/,
    );
    expect(render(false)).toMatch(/aria-checked="false"/);
  });
});
