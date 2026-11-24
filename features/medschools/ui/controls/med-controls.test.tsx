import { Plus } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string }) => o.defaultValue,
  }),
}));

import { MedButton } from './MedButton';
import { MedInput, MedTextarea } from './MedField';
import { MedIconButton } from './MedIconButton';
import { MedSearch } from './MedSearch';
import { MedSwitch } from './MedSwitch';

const noop = () => undefined;

describe('MedButton', () => {
  it('is a native button, secondary (the tonal fill) by default, never submitting by accident', () => {
    const html = renderToString(<MedButton>Save</MedButton>);
    expect(html).toContain('<button type="button"');
    expect(html).toContain('class="medapp-btn"');
    expect(html).toContain('data-variant="secondary"');
  });
  it('maps the variants to the button modifiers, never the pill of a toggle', () => {
    expect(renderToString(<MedButton variant="primary">Go</MedButton>)).toContain('medapp-btn medapp-btn--primary');
    expect(renderToString(<MedButton variant="tertiary">Go</MedButton>)).toContain('medapp-btn medapp-btn--tertiary');
    expect(renderToString(<MedButton variant="danger">Go</MedButton>)).toContain('medapp-btn medapp-btn--danger');
    expect(renderToString(<MedButton>Go</MedButton>)).not.toContain('medapp-chip');
  });
  it('loading disables the button and says it is busy', () => {
    const html = renderToString(<MedButton loading>Save</MedButton>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(renderToString(<MedButton>Save</MedButton>)).not.toContain('aria-busy');
  });
});

describe('MedIconButton', () => {
  it('names itself: aria-label and title are the label, the icon is hidden, popup state passes through', () => {
    const html = renderToString(
      <MedIconButton icon={Plus} label="Actions for Duke" aria-haspopup="menu" aria-expanded={false} />,
    );
    expect(html).toContain('aria-label="Actions for Duke"');
    expect(html).toContain('title="Actions for Duke"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="medapp-round"');
  });
});

describe('fields', () => {
  it('an input and a textarea are native, with the field class and their own attributes', () => {
    const input = renderToString(<MedInput type="date" min="2026-06-01" aria-invalid />);
    expect(input).toContain('<input');
    expect(input).toContain('class="medapp-field"');
    expect(input).toContain('type="date"');
    expect(input).toContain('aria-invalid="true"');
    const area = renderToString(<MedTextarea maxLength={20} rows={3} />);
    expect(area).toContain('<textarea');
    expect(area).toContain('dir="auto"');
    expect(area).toContain('maxLength="20"');
  });
});

describe('MedSearch', () => {
  it('is a search input with a hidden icon, and a clear button named in words only once there is text', () => {
    const empty = renderToString(<MedSearch value="" onValueChange={noop} aria-label="Search schools" />);
    expect(empty).toContain('type="search"');
    expect(empty).toContain('aria-label="Search schools"');
    expect(empty).not.toContain('Clear search');
    const full = renderToString(<MedSearch value="duke" onValueChange={noop} aria-label="Search schools" />);
    expect(full).toContain('aria-label="Clear search"');
    expect(full).toContain('type="button"');
  });
});

describe('MedSwitch', () => {
  it('is a button with role switch and the state in aria-checked, named by the caller', () => {
    const off = renderToString(<MedSwitch checked={false} onCheckedChange={noop} aria-labelledby="l" />);
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('aria-labelledby="l"');
    const on = renderToString(<MedSwitch checked onCheckedChange={noop} disabled aria-label="Share" />);
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('disabled=""');
  });
});
