import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, o: { defaultValue: string }) => o.defaultValue }),
}));

import { ConfirmProvider, useConfirm } from '../confirm-dialog';

function Probe() {
  return <span data-has-confirm={typeof useConfirm() === 'function'} />;
}

describe('ConfirmProvider', () => {
  it('provides confirm() and renders no dialog until one is asked for', () => {
    const html = renderToString(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>,
    );
    expect(html).toBe('<span data-has-confirm="true"></span>');
  });

  it('reaches the dialog stack only through a dynamic import', () => {
    const source = readFileSync(join(__dirname, '..', 'confirm-dialog.tsx'), 'utf8');
    expect(source).toMatch(/import\('\.\/confirm-dialog-view'\)/);
    expect(source).not.toMatch(/from '@\/components\/ui\/dialog'/);
    expect(source).not.toMatch(/from '\.\/confirm-dialog-view'/);
  });
});
