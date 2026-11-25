import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ListImportPreview } from './ListImportPreview';
import { toListEditable } from './model';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k] ?? '')),
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...rest }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <select aria-label={rest['aria-label']}>{children}</select>
  ),
}));

const duke = { slug: 'duke', name: 'Duke University School of Medicine', shortName: 'Duke', degree: 'MD' as const, state: 'NC' };
const rows = toListEditable({
  truncated: false,
  dropped: 0,
  tier: 'free',
  remainingToday: 1,
  dailyCap: 25,
  rows: [
    { key: 'duke|PHD', schoolName: 'Duke', school: duke, program: 'PHD' },
    { key: '?unrecognised-1|ANY', schoolName: 'Touro', school: null, program: 'ANY' },
  ],
});

describe('ListImportPreview', () => {
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <ListImportPreview rows={rows} existing={new Set()} onRows={() => undefined} />
    </QueryClientProvider>,
  );

  it('a matched row has its crest, name, meta and a program choice in the school degree', () => {
    expect(html).toContain('medapp-crest');
    expect(html).toContain('Duke University School of Medicine');
    expect(html).toContain('MD · NC');
    expect(html).toContain('aria-label="Program for Duke University School of Medicine"');
    expect(html).toContain('Either program');
    expect(html).toContain('MD-PhD');
  });

  it('an unmatched name is "Unrecognised school", says what the file wrote, and offers the picker unticked', () => {
    expect(html).toContain('Unrecognised school');
    expect(html).toContain('Your file says &quot;Touro&quot;');
    expect(html).toMatch(/aria-label="Pick the school for/);
    expect(html).toMatch(/<input type="checkbox" class="medapp-check" disabled=""/);
  });
});

describe('the lists page wiring (source)', () => {
  const page = readFileSync('features/medschools/ui/lists/ListsPage.tsx', 'utf8');
  const section = readFileSync('features/medschools/ui/lists/ListSection.tsx', 'utf8');
  const view = readFileSync('features/medschools/ui/lists/import/ListImport.tsx', 'utf8');

  it('the import is a lazy chunk that replaces the page while open', () => {
    expect(page).toContain("lazy(() => import('./import/ListImport'))");
    expect(page).toMatch(/if \(importing !== null\)/);
  });

  it('"Import a new list" is a secondary button; each list menu has "Import into this list"', () => {
    expect(page).toContain(
      '<MedButton variant="secondary" disabled={atListCap} onClick={() => setImporting({ list: null })}>',
    );
    expect(section).toContain("'lists-import-into'");
  });

  it('the view has exactly one ink primary, "Add to list", and no raw fetch', () => {
    expect(view.match(/variant="primary"/g)).toHaveLength(1);
    expect(view).toContain("'lists-import-add'");
    expect(view).not.toMatch(/\bfetch\(/);
  });
});
