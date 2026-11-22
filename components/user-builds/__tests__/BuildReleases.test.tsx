import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => false }));

import { BuildReleases } from '../BuildReleases';
import type { ReleaseView } from '@/lib/builds/releases';

const release = (id: string, version: string, createdAt: string, extra: Partial<ReleaseView> = {}): ReleaseView => ({
  id,
  version,
  changelog: null,
  commitHash: null,
  createdAt,
  ...extra,
});

const releases = [
  release('r1', '1.0', '2026-01-01T00:00:00.000Z', { changelog: 'First **cut**' }),
  release('r3', '1.2', '2026-03-01T00:00:00.000Z', {
    changelog: 'Latest <script>alert(1)</script> notes',
    commitHash: '3f2a9c1d4e5b6a79',
  }),
  release('r2', '1.1', '2026-02-01T00:00:00.000Z', { changelog: 'Second change' }),
];

const render = (props: Partial<Parameters<typeof BuildReleases>[0]> = {}) =>
  renderToStaticMarkup(
    <BuildReleases
      buildId="b1"
      repoUrl="https://github.com/rmh/studio"
      isOwner={false}
      initialReleases={releases}
      {...props}
    />,
  );

describe('BuildReleases', () => {
  it('expands the latest release and collapses the earlier ones behind a disclosure', () => {
    const html = render();
    expect(html).toContain('id="releases"');
    expect(html).toContain('1.2');
    expect(html).toContain('Latest');
    expect(html).toContain('notes');
    expect(html).toContain('Earlier releases (2)');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Second change');
    expect(html).not.toContain('First <strong>cut</strong>');
  });

  it('renders the changelog as Markdown without raw HTML, and links the commit on GitHub', () => {
    const html = render();
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://github.com/rmh/studio/commit/3f2a9c1d4e5b6a79"');
    expect(html).toContain('>3f2a9c1<');
    expect(html).toContain('<time dateTime="2026-03-01T00:00:00.000Z">');
  });

  it('shows the owner controls only to the owner', () => {
    const visitor = render();
    expect(visitor).not.toContain('New release');
    expect(visitor).not.toContain('Delete release');
    const owner = render({ isOwner: true });
    expect(owner).toContain('New release');
    expect(owner).toContain('Delete release 1.2');
  });

  it('is absent for a visitor when there are no releases, and an invitation for the owner', () => {
    expect(render({ initialReleases: [] })).toBe('');
    const owner = render({ initialReleases: [], isOwner: true });
    expect(owner).toContain('No releases yet');
    expect(owner).toContain('New release');
  });

  it('leaves a commit as plain text when the repository is not on GitHub', () => {
    const html = render({ repoUrl: 'https://gitlab.com/rmh/studio' });
    expect(html).toContain('3f2a9c1');
    expect(html).not.toContain('/commit/');
  });
});
