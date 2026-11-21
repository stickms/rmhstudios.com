// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString as render } from 'react-dom/server';
import { Dialog } from '@/components/ui/dialog';

const renderToString = (node: React.ReactElement) => render(<Dialog open>{node}</Dialog>);
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, o: { defaultValue: string }) => o.defaultValue }),
}));

import { CopyFallbackProvider, useCopyFallback } from '../copy-fallback';
import { CopyFallbackBody } from '../copy-fallback-view';

const read = (name: string) => readFileSync(join(__dirname, '..', name), 'utf8');

describe('CopyFallbackBody', () => {
  it('shows the text in a read-only field with Copy and Close', () => {
    const html = renderToString(
      <CopyFallbackBody options={{ title: 'Copy this link:', text: 'https://rmhstudios.com/x' }} close={() => {}} />,
    );
    expect(html).toContain('value="https://rmhstudios.com/x"');
    expect(html).toContain('readOnly=""');
    expect(html).toContain('aria-label="Copy this link:"');
    expect(html).toContain('>Copy<');
    expect(html).toContain('>Close<');
  });

  it('announces nothing until the text was copied', () => {
    const html = renderToString(<CopyFallbackBody options={{ title: 'T', text: 'x' }} close={() => {}} />);
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"[^>]*><\/p>/);
  });

  it('uses the caller labels over the defaults', () => {
    const html = renderToString(
      <CopyFallbackBody options={{ title: 'T', text: 'x', copyLabel: 'Copiar', closeLabel: 'Cerrar' }} close={() => {}} />,
    );
    expect(html).toContain('>Copiar<');
    expect(html).toContain('>Cerrar<');
  });
});

describe('useCopyFallback', () => {
  function Probe() {
    return <span data-has={typeof useCopyFallback() === 'function'} />;
  }

  it('is provided by CopyFallbackProvider, which renders no dialog until used', () => {
    expect(
      render(
        <CopyFallbackProvider>
          <Probe />
        </CopyFallbackProvider>,
      ),
    ).toBe('<span data-has="true"></span>');
  });

  it('throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/CopyFallbackProvider/);
  });
});

describe('copy fallback wiring', () => {
  it('selects on focus, copies through useClipboard (which has its own legacy path), and closes on dismissal', () => {
    const view = read('copy-fallback-view.tsx');
    expect(view).toMatch(/event\.currentTarget\.select\(\)/);
    expect(view).toContain('useClipboard');
    expect(view).toMatch(/if \(!open\) close\(\)/);
    expect(view).not.toMatch(/requestAnimationFrame/);
  });

  it('loads the dialog stack only through a dynamic import', () => {
    const provider = read('copy-fallback.tsx');
    expect(provider).toMatch(/import\('\.\/copy-fallback-view'\)/);
    expect(provider).not.toMatch(/from '@\/components\/ui\/dialog'/);
  });
});
