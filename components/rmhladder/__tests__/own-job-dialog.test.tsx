import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EMPTY_OWN_JOB_VALUES,
  OwnJobForm,
  candidateOf,
  valuesOf,
  type OwnJobFormLabels,
  type OwnJobFormValues,
} from '@/components/rmhladder/OwnJobDialog';
import { LADDER_OWN_JOB_LIMIT, type OwnJobView } from '@/lib/rmhladder/own-jobs';
import { ownJobBody } from '@/lib/rmhladder/own-jobs-schema';

/**
 * The add/edit form (sprint 13, feature 08), rendered to markup with no DOM: every field is named by a label linked
 * with `htmlFor`, member-text fields carry `dir="auto"`, the cap shows as a line of text and stops the save, and a
 * typed value reaches the schema as the server will read it. The dialog chunk is the only place zod is imported.
 */

const labels: OwnJobFormLabels = {
  title: 'Job title',
  company: 'Company',
  link: 'Link to the posting',
  linkHint: 'Saved as a link only.',
  location: 'Location',
  remote: 'Work setup',
  remoteOptions: [
    { value: 'onsite', label: 'On site' },
    { value: 'remote_us', label: 'Remote' },
  ],
  employment: 'Type',
  employmentOptions: [{ value: 'internship', label: 'Internship' }],
  deadline: 'Application deadline',
  payMin: 'Pay, lowest',
  payMax: 'Pay, highest',
  payPeriod: 'Paid per',
  payPeriodOptions: [{ value: 'year', label: 'Year' }],
  currency: 'Currency',
  submit: 'Add job',
  cancel: 'Cancel',
};

function view(over: Partial<Parameters<typeof OwnJobForm>[0]> = {}) {
  return (
    <OwnJobForm
      labels={labels}
      values={EMPTY_OWN_JOB_VALUES}
      errors={{}}
      notice={null}
      formError={null}
      busy={false}
      capReached={false}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      {...over}
    />
  );
}

describe('OwnJobForm', () => {
  const html = renderToStaticMarkup(view());

  it('names every field with a label linked by htmlFor', () => {
    for (const [field, text] of [
      ['title', 'Job title'],
      ['company', 'Company'],
      ['link', 'Link to the posting'],
      ['location', 'Location'],
      ['remoteStatus', 'Work setup'],
      ['employmentType', 'Type'],
      ['deadline', 'Application deadline'],
      ['payMin', 'Pay, lowest'],
      ['payMax', 'Pay, highest'],
      ['payPeriod', 'Paid per'],
      ['payCurrency', 'Currency'],
    ] as const) {
      expect(html, field).toMatch(new RegExp(`<label[^>]*for="own-job-${field}"[^>]*>${text}</label>`));
      expect(html, field).toContain(`id="own-job-${field}"`);
    }
  });

  it('gives member-text fields a direction of their own and the link a url keyboard', () => {
    for (const field of ['title', 'company', 'link', 'location']) {
      expect(html).toMatch(new RegExp(`id="own-job-${field}"[^>]*dir="auto"|dir="auto"[^>]*id="own-job-${field}"`));
    }
    expect(html).toMatch(/type="url"/);
    expect(html).toContain('Saved as a link only.');
  });

  it('has one primary button, and Cancel is not a submit', () => {
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1);
    const cancel = html.match(/<button[^>]*>(?:<span[^>]*>)?Cancel/)?.[0] ?? '';
    expect(cancel.includes('type="button"')).toBe(true);
  });

  it('shows the cap as a line of text and disables the save', () => {
    const message = `You can track up to ${LADDER_OWN_JOB_LIMIT} jobs you added yourself. Delete one first.`;
    const capped = renderToStaticMarkup(view({ notice: message, capReached: true }));
    expect(capped).toContain(message);
    const status = capped.match(/<p role="status"[^>]*>/)?.[0] ?? '';
    expect(status).not.toBe('');
    // not a tinted box: a line of text on a rule
    expect(status.includes('bg-')).toBe(false);
    expect(status.includes('border-b border-site-border')).toBe(true);
    const submit = capped.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(submit.includes('disabled=""')).toBe(true);
    expect((html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '').includes('disabled=""')).toBe(false);
  });

  it('wires an error to its field for assistive technology', () => {
    const bad = renderToStaticMarkup(view({ errors: { link: 'Enter a link that starts with http:// or https://.' } }));
    expect(bad).toContain('aria-invalid="true"');
    expect(bad).toContain('aria-describedby="own-job-link-error"');
    expect(bad).toContain('id="own-job-link-error"');
  });
});

describe('what the form sends', () => {
  const typed = (over: Partial<OwnJobFormValues>): OwnJobFormValues => ({
    ...EMPTY_OWN_JOB_VALUES,
    title: '  Data intern ',
    company: 'Tiny Labs',
    ...over,
  });

  it('turns blanks into nulls and parses with the shared schema', () => {
    const parsed = ownJobBody.safeParse(
      candidateOf(typed({ link: 'https://example.com/j', payMin: '20', payMax: '25', payPeriod: 'hour' })),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        title: 'Data intern',
        link: 'https://example.com/j',
        location: null,
        deadline: null,
        payMin: 20,
        payMax: 25,
        payPeriod: 'hour',
      });
    }
  });

  it('rejects a bad link, a title with nothing in it and a pay range the wrong way round', () => {
    expect(ownJobBody.safeParse(candidateOf(typed({ link: 'javascript:alert(1)' }))).success).toBe(false);
    expect(ownJobBody.safeParse(candidateOf(typed({ title: '   ' }))).success).toBe(false);
    const flipped = ownJobBody.safeParse(candidateOf(typed({ payMin: '90', payMax: '80' })));
    expect(flipped.success).toBe(false);
    if (!flipped.success) expect(flipped.error.issues[0]).toMatchObject({ path: ['payMax'], message: 'payOrder' });
    expect(ownJobBody.safeParse(candidateOf(typed({ payMin: 'lots' }))).success).toBe(false);
  });

  it('fills the form back from a saved job', () => {
    const job: OwnJobView = {
      id: 'j1',
      title: 'T',
      company: 'C',
      ownCompany: true,
      link: 'https://example.com',
      location: null,
      remoteStatus: 'hybrid',
      employmentType: 'full_time',
      deadline: '2027-03-01',
      payMin: 20,
      payMax: null,
      payPeriod: 'hour',
      payCurrency: 'EUR',
      createdAt: '2026-12-20T00:00:00.000Z',
    };
    expect(valuesOf(job)).toMatchObject({
      link: 'https://example.com',
      location: '',
      payMin: '20',
      payMax: '',
      payCurrency: 'EUR',
    });
  });
});

describe('the dialog stays off the route', () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

  it('is only ever imported lazily, so zod is not on the pipeline route’s critical path', () => {
    for (const file of ['components/rmhladder/AddOwnJobButton.tsx', 'components/rmhladder/OwnJobControls.tsx']) {
      const source = read(file);
      expect(source, file).toMatch(/lazy\(\(\) => import\([^)]*OwnJobDialog/);
      expect(source, file).not.toMatch(/^import [^;]*from '[^']*OwnJobDialog'/m);
      expect(source, file).not.toMatch(/from 'zod'|own-jobs-schema/);
    }
    // and the route reaches them only through those two, never the dialog itself
    const route = read('app/routes/_site/rmhladder/pipeline.tsx');
    expect(route).not.toMatch(/OwnJobDialog|own-jobs-schema|\blazy\(/);
  });
});
