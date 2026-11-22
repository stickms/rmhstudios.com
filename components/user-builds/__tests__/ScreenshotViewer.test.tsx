// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      o: {
        defaultValue: string;
        [k: string]: unknown;
      },
    ) => o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
  }),
}));

import { Dialog } from '@/components/ui/dialog';
import ScreenshotViewer, { ScreenshotViewerBody } from '../ScreenshotViewer';
import { ScreenshotStrip } from '../ScreenshotStrip';

const items = [
  {
    url: 'https://x/one.webp',
    width: 1280,
    height: 720,
    description: 'The title screen',
  },
  {
    url: 'https://x/two.webp',
    width: 800,
    height: 600,
    description: 'The level list',
  },
];

describe('ScreenshotViewerBody', () => {
  it('shows only the current picture, with its description as alt and as visible text', () => {
    const html = renderToString(
      <Dialog open>
        <ScreenshotViewerBody items={items} index={1} onIndexChange={() => {}} />
      </Dialog>,
    );
    expect(html).toContain('alt="The level list"');
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
    expect(html).toContain('>The level list</p>');
    expect(html).not.toContain('one.webp');
    expect(html).toContain('Screenshot 2 of 2');
  });

  it('has Previous and Next when there is more than one picture, and neither for one', () => {
    const two = renderToString(
      <Dialog open>
        <ScreenshotViewerBody items={items} index={0} onIndexChange={() => {}} />
      </Dialog>,
    );
    expect(two).toContain('Previous');
    expect(two).toContain('Next');
    const one = renderToString(
      <Dialog open>
        <ScreenshotViewerBody items={items.slice(0, 1)} index={0} onIndexChange={() => {}} />
      </Dialog>,
    );
    expect(one).not.toContain('Previous');
  });
});

describe('ScreenshotViewer dialog', () => {
  it('is a dialog titled by its heading (the portal renders on the client only)', () => {
    expect(typeof ScreenshotViewer).toBe('function');
    const src = readFileSync(join(__dirname, '..', 'ScreenshotViewer.tsx'), 'utf8');
    expect(src).toContain('<DialogTitle>');
    expect(src).toContain('<Dialog open={open}');
  });

  it('steps with the arrow keys, closes with Escape (Radix) and returns focus through the dialog primitive', () => {
    const src = readFileSync(join(__dirname, '..', 'ScreenshotViewer.tsx'), 'utf8');
    expect(src).toContain('viewerKeyAction');
    expect(src).toContain("addEventListener('keydown'");
    const dialog = readFileSync(join(__dirname, '../../ui/dialog.tsx'), 'utf8');
    // the opener is remembered and focused again on close (the thumbnail that opened the viewer)
    expect(dialog).toContain('opener.focus()');
    expect(src).not.toContain('requestAnimationFrame');
  });
});

describe('ScreenshotStrip', () => {
  it('renders a button per picture with the description as alt and dimensions on every image', () => {
    const html = renderToStaticMarkup(<ScreenshotStrip items={items} />);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('alt="The title screen"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('width="1280"');
  });

  it('renders nothing for no pictures and does not mount the viewer at rest', () => {
    expect(renderToStaticMarkup(<ScreenshotStrip items={[]} />)).toBe('');
    expect(renderToStaticMarkup(<ScreenshotStrip items={items} />)).not.toContain('role="dialog"');
  });
});
