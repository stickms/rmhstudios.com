/**
 * One directory entry, not two. The Spaces list was a bare two-line link beside a Communities list of
 * full entries; both now render `DirectoryItem`. This holds that neither grows its own copy back.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const communities = read('../../feed/CommunitiesColumn.tsx');
const spaces = read('../../spaces/SpacesColumn.tsx');
const item = read('../directory-item.tsx');

describe('DirectoryItem is the one directory entry', () => {
  it.each([
    ['Communities', communities],
    ['Spaces', spaces],
  ])('%s renders its list with DirectoryItem in the shared list', (_name, src) => {
    expect(src).toContain("from '@/components/ui/directory-item'");
    expect(src).toContain('<DirectoryItem');
    expect(src).toContain('className={DIRECTORY_LIST_CLASS}');
  });

  it('neither column hand-rolls the entry or its tile', () => {
    for (const src of [communities, spaces]) {
      expect(src).not.toContain('flex items-start gap-4 rounded-site');
      expect(src).not.toContain('h-14 w-14');
    }
  });

  it('a Space entry carries what a listener needs: host, live state, and a way in', () => {
    expect(spaces).toContain('<UserAvatar');
    expect(spaces).toContain("t('space-live-tag'");
    expect(spaces).toContain("t('space-hosted-by'");
    expect(spaces).toContain("action={t('space-join'");
  });

  it('the action is a label inside the link, never a second control', () => {
    expect(item).not.toMatch(/<button|<Button/);
    expect(item).toContain('aria-hidden');
  });
});
