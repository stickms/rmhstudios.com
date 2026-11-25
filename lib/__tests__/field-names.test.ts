/**
 * Every form field has an accessible name (sprint 11, feature 20).
 *
 * A text field, select, textarea, slider or switch with no name is announced as "edit text" and cannot be reached by
 * voice ("click Search"). A placeholder is not a name: the HTML accessible-name computation uses it only as a last
 * resort and readers differ (WCAG 2.2 SC 4.1.2, 1.3.1). The rule lives in `field-names-scan.ts` and reads each
 * file's syntax tree, so a comment or a string never names a field.
 *
 * Two numbers hold it:
 *  - `UNNAMED_FILES` is empty: no file is exempt. A file that genuinely cannot name a field (a canvas game whose
 *    input is drawn, say) is listed here by EXACT path with a reason a reviewer can check, never by folder.
 *  - `BASELINE` is the count across `app/`, `components/` and `features/`; it started at 169 and only falls.
 *
 * `components/ui/` holds the primitives (`Input`, `Textarea`, `Select`, `Switch`, `Slider`, `SearchField`): they pass
 * props through, so they are exempt as definitions and their call sites are what is checked.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LABEL_PROP_PRIMITIVES,
  SHARED_LABEL_MODULES,
  ID_PROPS,
  ID_PROP_FILES,
  PASS_THROUGH_FIELDS,
  discoverLabelComponents,
  findPassThroughDefinitions,
  findUnnamedFields,
} from './field-names-scan';

/** Lower this when you name fields. Never raise it. */
const BASELINE = 0;

/** Exact paths that may hold unnamed fields, each with the reason and the keyboard alternative. Empty on purpose. */
const UNNAMED_FILES: Record<string, string> = {};

function unnamed(source: string): number {
  return findUnnamedFields(source).length;
}

describe('field-names rule', () => {
  it('counts a field with a non-empty aria-label or aria-labelledby as named', () => {
    expect(unnamed('const a = <input aria-label="Search messages" />;')).toBe(0);
    expect(unnamed("const a = <Input aria-label={t('k', { defaultValue: 'Minutes' })} />;")).toBe(0);
    expect(unnamed('const a = <Slider aria-label="Volume" />;')).toBe(0);
  });

  it('counts an id that a label in the same file names (literal and expression)', () => {
    expect(unnamed('const a = <><label htmlFor="n">Name</label><input id="n" /></>;')).toBe(0);
    expect(unnamed('const a = <><Label htmlFor={id}>Name</Label><Input id={id} /></>;')).toBe(0);
    expect(unnamed('const a = <><Label htmlFor={`${id}-a`}>Name</Label><Input id={`${id}-a`} /></>;')).toBe(0);
  });

  it('counts a field inside a label as named', () => {
    expect(unnamed('const a = <label>Name <input /></label>;')).toBe(0);
    expect(unnamed('const a = <Label>Name <Select><option /></Select></Label>;')).toBe(0);
  });

  it('counts a field inside a component that renders a label around its children as named', () => {
    const source = [
      'function Field({ label, children }) { return <label><span>{label}</span>{children}</label>; }',
      'const a = <Field label="Make"><Input /></Field>;',
    ].join('\n');
    expect(unnamed(source)).toBe(0);
  });

  it('counts a field passed to a label component that shares its htmlFor as named', () => {
    const source = [
      'function Row({ htmlFor, label, control }) { return <div><label htmlFor={htmlFor}>{label}</label>{control}</div>; }',
      'const a = <Row htmlFor={id} label="Size" control={<select id={id} />} />;',
    ].join('\n');
    expect(unnamed(source)).toBe(0);
    // The same row with a different id does not name the field.
    const other = source.replace('<select id={id} />', '<select id={other} />');
    expect(unnamed(other)).toBe(1);
  });

  it('counts hidden, submit, button and reset inputs, and fields no reader reaches, as not needing a name', () => {
    for (const type of ['hidden', 'submit', 'button', 'reset']) {
      expect(unnamed(`const a = <input type="${type}" />;`)).toBe(0);
    }
    expect(unnamed('const a = <input type="file" aria-hidden className="sr-only" />;')).toBe(0);
    expect(unnamed('const a = <input type="file" hidden />;')).toBe(0);
  });

  it('counts a native field that spreads its props as a definition, and checks the call sites', () => {
    expect(unnamed('const T = ({ ...rest }) => <input {...rest} />;')).toBe(0);
    expect(unnamed('const a = <MentionTextarea value="" />;')).toBe(1);
    expect(unnamed('const a = <MentionTextarea aria-label="Reply" />;')).toBe(0);
  });

  it('does not count a placeholder alone', () => {
    expect(unnamed('const a = <input placeholder="Search" />;')).toBe(1);
    expect(unnamed("const a = <Input placeholder={t('k', { defaultValue: 'Search' })} />;")).toBe(1);
    expect(unnamed('const a = <textarea placeholder="Your answer" />;')).toBe(1);
  });

  it('does not count a title, an empty aria-label or an aria-label of nothing', () => {
    expect(unnamed('const a = <input title="Search" />;')).toBe(1);
    expect(unnamed('const a = <input aria-label="" />;')).toBe(1);
    expect(unnamed('const a = <input aria-label={""} />;')).toBe(1);
    expect(unnamed('const a = <input aria-label={undefined} />;')).toBe(1);
    expect(unnamed('const a = <input aria-labelledby="" />;')).toBe(1);
  });

  it('counts aria-labelledby only when it points at an id that exists in the file', () => {
    expect(unnamed('const a = <><h2 id="h">Notes</h2><textarea aria-labelledby="h" /></>;')).toBe(0);
    expect(unnamed('const a = <><h2 id={hid}>Notes</h2><textarea aria-labelledby={hid} /></>;')).toBe(0);
    expect(unnamed('const a = <textarea aria-labelledby="missing" />;')).toBe(1);
    expect(unnamed('const a = <><h2 id="h">Notes</h2><textarea aria-labelledby="other" /></>;')).toBe(1);
    expect(unnamed('const a = <Switch aria-labelledby={labelId} />;')).toBe(1);
  });

  it('exempts a hidden or aria-hidden field only when no reader reaches it', () => {
    expect(unnamed('const a = <input type="text" aria-hidden />;')).toBe(1);
    expect(unnamed('const a = <input type="file" aria-hidden="false" />;')).toBe(1);
    expect(unnamed('const a = <input type="file" hidden={false} />;')).toBe(1);
  });

  it('does not count a comment, or a label that names a different id', () => {
    expect(unnamed('const a = <input /* aria-label="Search" */ />;')).toBe(1);
    expect(unnamed('// <input aria-label="Search" />\nconst a = <input />;')).toBe(1);
    expect(unnamed('const a = <><label htmlFor="a">A</label><input id="b" /></>;')).toBe(1);
    expect(unnamed('const a = <><label>Name</label><input /></>;')).toBe(1);
  });

  it('does not count a label in another file', () => {
    // The id is only a name when a label in THIS file points at it.
    expect(unnamed('const a = <input id="from-another-file" />;')).toBe(1);
  });

  it('counts a primitive given a label prop only where the primitive is listed as rendering it', () => {
    expect(unnamed('const a = <Input label="Name" />;')).toBe(1);
    // The listed primitives render their `label` prop; none does today, so the table is empty and each future entry
    // must carry the file and line that renders it.
    expect(Object.keys(LABEL_PROP_PRIMITIVES)).toEqual([]);
  });

  it('proves each id prop is rendered as an id by its component', () => {
    for (const [tag, prop] of Object.entries(ID_PROPS)) {
      const source = readFileSync(ID_PROP_FILES[tag] ?? '', 'utf8');
      expect(source, `${tag} no longer renders id={${prop}}`).toContain(`id={${prop}}`);
    }
    expect(unnamed('const a = <S titleId={x}><Switch aria-labelledby={x} /></S>;')).toBe(1);
    expect(unnamed('const a = <SettingsSection titleId={x}><Switch aria-labelledby={x} /></SettingsSection>;')).toBe(0);
  });

  it('reads each shared label module and finds the label it is listed for', () => {
    for (const [specifier, file] of Object.entries(SHARED_LABEL_MODULES)) {
      const found = discoverLabelComponents(readFileSync(file, 'utf8'), file);
      expect(found.wrappers.size + found.labels.size, `${specifier} (${file}) renders no label`).toBeGreaterThan(0);
    }
  });
});

describe('field names across the site', () => {
  it(
    'lists every component that passes its props to a native field, so its call sites are checked',
    { timeout: 60_000 },
    () => {
      const defined = new Set<string>();
      for (const path of globSync('{app,components,features}/**/*.tsx', {
        exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
      }).map(String)) {
        if (path.startsWith('components/ui/')) continue;
        for (const name of findPassThroughDefinitions(readFileSync(path, 'utf8'), path)) defined.add(name);
      }
      const missing = [...defined].filter((n) => !PASS_THROUGH_FIELDS.includes(n)).sort();
      expect(missing, 'add these to PASS_THROUGH_FIELDS in field-names-scan.ts').toEqual([]);
    },
  );

  const files = globSync('{app,components,features}/**/*.tsx', {
    exclude: (f) => /node_modules|__tests__|\.test\.|routeTree\.gen/.test(String(f)),
  })
    .map(String)
    .filter((f) => !f.startsWith('components/ui/'));

  function scan(): { total: number; site: string[]; all: string[] } {
    const site: string[] = [];
    const all: string[] = [];
    let total = 0;
    for (const path of files) {
      const found = findUnnamedFields(readFileSync(path, 'utf8'), path);
      if (!found.length) continue;
      total += found.length;
      const lines = found.map((f) => `${path}:${f.line} <${f.tag}>`);
      all.push(...lines);
      const exempt = path in UNNAMED_FILES;
      if (!exempt && (path.startsWith('app/routes/_site/') || path.startsWith('components/'))) site.push(...lines);
    }
    return { total, site, all };
  }

  it('leaves no unnamed field in the site tier', { timeout: 60_000 }, () => {
    const { site } = scan();
    expect(site, `Name these fields: aria-label through t(), or a visible label tied by htmlFor and id.`).toEqual([]);
  });

  it('does not grow and is lowered as it shrinks', { timeout: 60_000 }, () => {
    const { total, all } = scan();
    const hint = `\n${all.slice(0, 20).join('\n')}`;
    expect(total, `unnamed fields grew: name them.${hint}`).toBeLessThanOrEqual(BASELINE);
    expect(total, `unnamed fields fell to ${total}: lower BASELINE to ${total}.${hint}`).toBeGreaterThanOrEqual(
      BASELINE,
    );
  });

  it('lists every exempt file by an exact path that exists and still needs the exemption', () => {
    for (const [path, reason] of Object.entries(UNNAMED_FILES)) {
      expect(path.includes('*') || path.endsWith('/'), `${path}: list exact paths, never folders`).toBe(false);
      expect(reason.length, `${path}: say why`).toBeGreaterThan(20);
      expect(
        findUnnamedFields(readFileSync(path, 'utf8'), path).length,
        `${path} is fully named: remove it`,
      ).toBeGreaterThan(0);
    }
  });
});
