// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Handle } from '../handle';

describe('Handle', () => {
  it('prints the @ and the handle inside one <bdi> so the @ stays first in a right-to-left page', () => {
    expect(renderToStaticMarkup(<Handle handle="playerone" />)).toBe('<bdi>@playerone</bdi>');
  });

  it('isolates the handle from an Arabic sentence around it', () => {
    const html = renderToStaticMarkup(
      <p dir="rtl">
        مرحبا <Handle handle="playerone" />
      </p>,
    );
    expect(html).toContain('<bdi>@playerone</bdi>');
  });

  it('takes rendered nodes, for a highlighted match', () => {
    expect(renderToStaticMarkup(<Handle handle={<mark>pla</mark>} />)).toBe('<bdi>@<mark>pla</mark></bdi>');
  });
});
