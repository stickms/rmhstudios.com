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

import { PromptProvider, submitPrompt, usePrompt } from '../prompt-dialog';
import { PromptForm } from '../prompt-dialog-view';

const read = (name: string) => readFileSync(join(__dirname, '..', name), 'utf8');

describe('submitPrompt', () => {
  it('returns the text as typed when there is no validator', () => {
    expect(submitPrompt('  keep spaces  ')).toEqual({ ok: true, value: '  keep spaces  ' });
    expect(submitPrompt('')).toEqual({ ok: true, value: '' });
  });

  it('blocks the submit with the validator error', () => {
    const validate = (v: string) => (v.trim() ? null : 'Enter a name');
    expect(submitPrompt('  ', validate)).toEqual({ ok: false, error: 'Enter a name' });
    expect(submitPrompt('Mix', validate)).toEqual({ ok: true, value: 'Mix' });
  });
});

describe('PromptForm', () => {
  const settle = () => {};

  it('opens with the initial value, the title, and the default button labels', () => {
    const html = renderToString(
      <PromptForm options={{ title: 'Rename playlist', initialValue: 'Road trip' }} settle={settle} />,
    );
    expect(html).toContain('value="Road trip"');
    expect(html).toContain('Rename playlist');
    expect(html).toContain('>Cancel<');
    expect(html).toContain('>Confirm<');
    expect(html).toContain('type="submit"');
  });

  it('names the field by its title when there is no label, and by the label when there is', () => {
    const bare = renderToString(<PromptForm options={{ title: 'New name' }} settle={settle} />);
    expect(bare).toContain('aria-label="New name"');
    const labelled = renderToString(<PromptForm options={{ title: 'Rename', label: 'Name' }} settle={settle} />);
    expect(labelled).toContain('>Name</label>');
    expect(labelled).not.toContain('aria-label=');
  });

  it('shows no error until a submit fails', () => {
    const html = renderToString(<PromptForm options={{ title: 'T', validate: () => 'bad' }} settle={settle} />);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-describedby');
  });

  it('uses the caller labels over the defaults', () => {
    const html = renderToString(
      <PromptForm options={{ title: 'T', confirmLabel: 'Save', cancelLabel: 'Back' }} settle={settle} />,
    );
    expect(html).toContain('>Save<');
    expect(html).toContain('>Back<');
  });
});

describe('usePrompt', () => {
  function Probe() {
    return <span data-has-prompt={typeof usePrompt() === 'function'} />;
  }

  it('is provided by PromptProvider, which renders no dialog until asked', () => {
    expect(
      render(
        <PromptProvider>
          <Probe />
        </PromptProvider>,
      ),
    ).toBe('<span data-has-prompt="true"></span>');
  });

  it('throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/PromptProvider/);
  });
});

describe('prompt dialog wiring', () => {
  it('loads the dialog stack only through a dynamic import', () => {
    const provider = read('prompt-dialog.tsx');
    expect(provider).toMatch(/import\('\.\/prompt-dialog-view'\)/);
    expect(provider).not.toMatch(/from '@\/components\/ui\/dialog'/);
    expect(provider).not.toMatch(/from '\.\/prompt-dialog-view'/);
  });

  it('cancels on every dismissal and never moves focus with a frame', () => {
    const view = read('prompt-dialog-view.tsx');
    expect(view).toMatch(/if \(!open\) settle\(null\)/);
    expect(view).toMatch(/onClick=\{\(\) => settle\(null\)\}/);
    expect(view).toContain('DialogContent'); // returns focus to the opener
    expect(view).not.toMatch(/requestAnimationFrame/);
    expect(read('prompt-dialog.tsx')).not.toMatch(/requestAnimationFrame/);
  });

  it('resolves null when the dialog cannot load, and when a newer prompt replaces it', () => {
    const provider = read('prompt-dialog.tsx');
    expect(provider).toMatch(/resolve\(null\)/);
    expect(provider).toMatch(/current\?\.resolve\(null\)/);
  });

  it('is mounted beside the confirm provider', () => {
    const providers = readFileSync(join(__dirname, '..', '..', 'Providers.tsx'), 'utf8');
    expect(providers).toContain('<PromptProvider>');
    expect(providers).toContain('<CopyFallbackProvider>');
  });
});
