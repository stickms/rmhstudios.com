/**
 * The automated-account mark is the bot icon alone (owner, 2026-11-13); the word is in a tooltip that hover, keyboard
 * focus and a tap can all reach, and the icon names itself for a screen reader.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

const { AutomatedBadge } = await import('../AutomatedBadge');
const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8');

describe('AutomatedBadge', () => {
  const out = renderToString(createElement(AutomatedBadge));

  it('shows the icon and no word', () => {
    expect(out).toMatch(/<svg[^>]*lucide-bot[^>]*aria-hidden="true"/);
    expect(out.replace(/<[^>]+>/g, '').trim()).toBe('');
  });

  it('is a focusable image named "Automated account"', () => {
    expect(out).toMatch(/<span role="img" tabindex="0" data-slot="automated-badge" aria-label="Automated account"/);
  });

  it('gets its word from the shared tooltip, and a press focuses it instead of following the link around it', () => {
    const src = read('components/feed/AutomatedBadge.tsx');
    expect(src).toContain("import { Tooltip } from '@/components/ui/Tooltip';");
    expect(src).toMatch(/event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*event\.currentTarget\.focus\(\);/);
    // 44px under a finger, and above a row link's stretched ::after.
    expect(src).toContain('pointer-coarse:after:-inset-3.5');
    expect(src).toContain('z-content');
  });

  it('is the one mark for a bot: the feed row, the post card, conversations and the profile', () => {
    for (const file of [
      'components/feed/FeedRow.tsx',
      'components/feed/RMHarkCard.tsx',
      'components/feed/MessagesColumn.tsx',
      'components/feed/conversation/ConversationHeader.tsx',
      'components/profile/ProfileHero.tsx',
    ]) {
      expect(read(file), file).toContain('<AutomatedBadge');
    }
    expect(read('components/profile/ProfileHero.tsx')).not.toContain("t('bot-account',");
  });
});
