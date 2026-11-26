import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { formatDateTime } from '@/lib/core/format';
import { recordingT } from '@/lib/__tests__/i18n-label-recorder';
import { NOTICE_TEMPLATES, fillNotice, noticeParamNames, type NoticeKey } from '@/lib/notifications/notice-keys';
import { inboxPreview, noticeText } from '@/components/feed/notice-previews';

const AT = '2026-12-01T14:30:00.000Z';
const KEYS = Object.keys(NOTICE_TEMPLATES) as NoticeKey[];
const INSTANT: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
};
const fmt = (locale: string) => (iso: string) => formatDateTime(iso, locale, INSTANT);

/** A `t` for one locale: the catalogue entry when it has one, else the English default, interpolated. */
function tFor(catalogue: Record<string, string>): TFunction {
  return ((key: string, opts: { defaultValue: string; [name: string]: unknown }) =>
    (catalogue[key] ?? opts.defaultValue).replace(/\{\{(\w+)\}\}/g, (_m, n: string) =>
      String(opts[n] ?? ''),
    )) as unknown as TFunction;
}

const ARABIC = {
  'notice-community-timeout-until': 'تم تقييدك من النشر في {{community}} حتى {{endsAt}}',
};

function sample(key: NoticeKey): Record<string, string> {
  return Object.fromEntries(
    noticeParamNames(NOTICE_TEMPLATES[key]).map((n) => [n, n.endsWith('At') ? AT : `Sample ${n}`]),
  );
}

// A key whose slot is an id the notice turns into its own sentence (s15-07): the sentence the sample id renders as.
const RENDERED_SLOTS: Partial<Record<NoticeKey, Record<string, string>>> = {
  'puzzle-report-reviewed': { outcome: 'We checked the puzzle and its answer stands.' },
};

// Member-written names are isolated in the sentence, so a right-to-left name never reorders it.
const strip = (s: string | null) => (s ?? '').replace(/[⁨⁩]/g, '');

describe('the notice catalogue', () => {
  it('answers every key, and its English default says what the stored fallback says', () => {
    const { t, calls } = recordingT();
    for (const key of KEYS) {
      const params = sample(key);
      const text = noticeText(t, key, params, (iso) => `<${iso}>`);
      expect(text, key).not.toBeNull();
      const expected = fillNotice(NOTICE_TEMPLATES[key], { ...params, ...RENDERED_SLOTS[key] }, (iso) => `<${iso}>`);
      expect(strip(text), key).toBe(expected);
    }
    // The report-kind words an admin notice borrows come from `my-reports`, not from the notice catalogue.
    const own = calls.filter((c) => c.ns === 'notice-language');
    expect(own.map((c) => c.key).sort()).toEqual(KEYS.map((k) => `notice-${k}`).sort());
    expect(new Set(calls.map((c) => c.ns))).toEqual(new Set(['notice-language', 'my-reports', 'fix-notices']));
  });

  it('keeps each default equal to the template, so a locale without the key reads like the fallback', () => {
    const { t, calls } = recordingT();
    for (const key of KEYS) noticeText(t, key, sample(key), (iso) => iso);
    for (const c of calls.filter((c) => c.ns === 'notice-language'))
      expect(c.defaultValue, c.key).toBe(NOTICE_TEMPLATES[c.key.slice('notice-'.length) as NoticeKey]);
  });
});

describe('the fix notices (s15-07)', () => {
  const at = (iso: string) => `<${iso}>`;

  it('writes a reviewed report with the outcome sentence, the mode’s name and the note', () => {
    const base = { mode: 'alibi', dateKey: '2026-12-10', outcome: 'fault', note: 'We fixed it.' };
    expect(strip(noticeText(tFor({}), 'puzzle-report-reviewed', base, at))).toBe(
      'Your report on the Alibi puzzle for 2026-12-10 was reviewed. You were right: the puzzle had a fault. Thank you. We fixed it.',
    );
    expect(strip(noticeText(tFor({}), 'puzzle-report-reviewed', { ...base, outcome: 'stands', note: '' }, at))).toBe(
      'Your report on the Alibi puzzle for 2026-12-10 was reviewed. We checked the puzzle and its answer stands.',
    );
  });

  it('reads the outcome in the reader’s language from the fix-notices catalogue', () => {
    const text = noticeText(
      tFor({ 'outcome-stands': 'تم التحقق من اللغز وإجابته صحيحة.' }),
      'puzzle-report-reviewed',
      { mode: 'alibi', dateKey: '2026-12-10', outcome: 'stands', note: '' },
      at,
    );
    expect(text).toContain('تم التحقق من اللغز وإجابته صحيحة.');
  });

  it('writes a moved deadline with both times in the reader’s format', () => {
    const params = { title: 'Space jam', submitEndsAt: AT, ratingEndsAt: '2026-12-08T14:30:00.000Z' };
    expect(strip(noticeText(tFor({}), 'jam-deadline-moved', params, fmt('en')))).toBe(
      `Space jam moved its deadlines: submissions close ${formatDateTime(AT, 'en', INSTANT)}, ratings close ${formatDateTime('2026-12-08T14:30:00.000Z', 'en', INSTANT)}`,
    );
  });
});

describe('rendering a notice in the reader’s language', () => {
  const params = { community: 'Chess', endsAt: AT };
  const row = {
    preview: 'You were timed out in Chess until 1 Dec 2026, 14:30 UTC',
    previewKey: 'community-timeout-until',
    previewParams: params,
  };

  it('writes a known key in Arabic with the end in the reader’s format', () => {
    const text = inboxPreview(tFor(ARABIC), row, fmt('ar'));
    expect(text).toContain('تم تقييدك من النشر في');
    expect(text).toContain(formatDateTime(AT, 'ar', INSTANT));
    expect(text).not.toContain('UTC');
    expect(strip(text)).toContain('Chess');
    // The community name is isolated from the Arabic around it.
    expect(text).toContain('⁨Chess⁩');
  });

  it('writes the same key in English with the end as a local date and time, not the UTC string', () => {
    const text = inboxPreview(tFor({}), row, fmt('en'));
    expect(strip(text)).toBe(`You were timed out in Chess until ${formatDateTime(AT, 'en', INSTANT)}`);
    expect(text).not.toContain('UTC');
  });

  it('renders as text in markup, escaping anything a member wrote', () => {
    const html = renderToStaticMarkup(
      <p>
        {inboxPreview(
          tFor({}),
          { preview: null, previewKey: 'community-pin', previewParams: { community: '<script>x</script>' } },
          fmt('en'),
        )}
      </p>,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back to the stored English for an unknown key', () => {
    const unknown = { preview: 'Stored English', previewKey: 'a-key-from-the-future', previewParams: {} };
    expect(inboxPreview(tFor(ARABIC), unknown, fmt('ar'))).toBe('Stored English');
    expect(renderToStaticMarkup(<p>{inboxPreview(tFor(ARABIC), unknown, fmt('ar'))}</p>)).toBe('<p>Stored English</p>');
  });

  it('falls back when the params do not fill the template, rather than showing a hole', () => {
    expect(inboxPreview(tFor({}), { ...row, previewParams: { community: 'Chess' } }, fmt('en'))).toBe(row.preview);
    expect(inboxPreview(tFor({}), { ...row, previewParams: null }, fmt('en'))).toBe(row.preview);
    expect(inboxPreview(tFor({}), { ...row, previewParams: ['Chess'] }, fmt('en'))).toBe(row.preview);
  });

  it('still shows an old row, which has no key, in English unchanged', () => {
    expect(inboxPreview(tFor(ARABIC), { preview: 'Old English sentence' }, fmt('ar'))).toBe('Old English sentence');
    expect(inboxPreview(tFor(ARABIC), { preview: null, previewKey: null }, fmt('ar'))).toBeNull();
  });
});
