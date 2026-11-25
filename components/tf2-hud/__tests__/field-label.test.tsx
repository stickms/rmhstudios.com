/**
 * `Field` names its field once (S11-20): the visible text is a real `<label htmlFor>` for a single field child, and
 * is not pointed at a wrapping `div`. A child that names itself keeps its own name and the visible text is hidden
 * from assistive technology instead of being a second name.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? '' }),
}));

import { Field, SelectField, TextField } from '@/components/tf2-hud/ui';

const idsOf = (html: string, attr: string) => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]);

describe('tf2-hud Field', () => {
  it('links the label to a native input by id', () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input aria-label="Title" />
      </Field>,
    );
    const [target] = idsOf(html, 'for');
    expect(target).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input[^>]* id="${target}"`));
    expect(html).toContain('<label');
    // No element that is not a field carries the label's id.
    expect(html).not.toMatch(new RegExp(`<div[^>]* id="${target}"`));
  });

  it('links the label to the field components of the file too', () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <TextField aria-label="Title" />
      </Field>,
    );
    const [target] = idsOf(html, 'for');
    expect(html).toMatch(new RegExp(`<input[^>]* id="${target}"`));
    const select = renderToStaticMarkup(
      <Field label="Visibility">
        <SelectField aria-label="Visibility" value="a">
          <option value="a">A</option>
        </SelectField>
      </Field>,
    );
    const [selectTarget] = idsOf(select, 'for');
    expect(select).toMatch(new RegExp(`id="${selectTarget}"`));
  });

  it('keeps a field’s own id', () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input id="mine" aria-label="Title" />
      </Field>,
    );
    expect(html).not.toContain('<label');
    expect(html).toContain('id="mine"');
  });

  it('hides the visible text, rather than naming a wrapper, when the child names itself', () => {
    const html = renderToStaticMarkup(
      <Field label="Paint">
        <button type="button" aria-label="Paint">
          Pick
        </button>
      </Field>,
    );
    expect(html).not.toContain('<label');
    expect(html).not.toContain(' for=');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Paint');
  });

  it('shows the hint', () => {
    const html = renderToStaticMarkup(
      <Field label="Visibility" hint="Unlisted by link">
        <input aria-label="Visibility" />
      </Field>,
    );
    expect(html).toContain('Unlisted by link');
  });
});
