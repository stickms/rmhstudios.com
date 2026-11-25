import { describe, expect, it } from 'vitest';
import {
  SUBTITLE_LIMITS,
  activeCueAt,
  coerceSubtitlePrefs,
  normalizeCueText,
  normalizeLang,
  parseSubtitles,
  validateCues,
} from '@/lib/rmhtube/subtitles';

function cues(source: string) {
  const r = parseSubtitles(source);
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`);
  return r.cues;
}

describe('parseSubtitles', () => {
  it('reads WebVTT with a header, identifiers, cue settings and dot milliseconds', () => {
    const out = cues(
      'WEBVTT - a title\n\nintro\n00:00:01.000 --> 00:00:02.500 align:start position:10%\nHello\n\n00:03.000 --> 00:04.000\nWorld\n',
    );
    expect(out).toEqual([
      { start: 1000, end: 2500, text: 'Hello' },
      { start: 3000, end: 4000, text: 'World' },
    ]);
  });

  it('reads SRT with comma milliseconds, a BOM and CRLF line endings', () => {
    const out = cues(
      '﻿1\r\n00:00:01,200 --> 00:00:03,400\r\nLine one\r\nLine two\r\n\r\n2\r\n01:00:00,000 --> 01:00:01,000\r\nLate\r\n',
    );
    expect(out).toEqual([
      { start: 1200, end: 3400, text: 'Line one\nLine two' },
      { start: 3_600_000, end: 3_601_000, text: 'Late' },
    ]);
  });

  it('drops NOTE, STYLE and REGION blocks whole', () => {
    const out = cues(
      'WEBVTT\n\nSTYLE\n::cue { color: red }\n\nNOTE this is a comment\n00:00:09.000 --> 00:00:10.000\nnot a cue\n\nREGION\nid:a\n\n00:00:01.000 --> 00:00:02.000\nReal\n',
    );
    expect(out).toEqual([{ start: 1000, end: 2000, text: 'Real' }]);
  });

  it('orders unordered cues by start, and refuses empty or cue-less files', () => {
    const out = cues('00:00:05,000 --> 00:00:06,000\nB\n\n00:00:01,000 --> 00:00:02,000\nA\n');
    expect(out.map((c) => c.text)).toEqual(['A', 'B']);
    expect(parseSubtitles('   \n')).toEqual({ ok: false, reason: 'empty' });
    expect(parseSubtitles('WEBVTT\n\nnothing here')).toEqual({ ok: false, reason: 'no_cues' });
  });

  it('skips cues with an end before the start or no text, and counts them', () => {
    const r = parseSubtitles(
      '00:00:02,000 --> 00:00:01,000\nBackwards\n\n00:00:01,000 --> 00:00:02,000\n<b></b>\n\n00:00:03,000 --> 00:00:04,000\nOK\n',
    );
    expect(r).toMatchObject({ ok: true, dropped: 2 });
  });

  it('refuses more than 5,000 cues', () => {
    const block = (i: number) =>
      `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String(i % 60).padStart(2, '0')},500\nx`;
    const big = Array.from({ length: SUBTITLE_LIMITS.MAX_CUES + 1 }, (_, i) => block(i)).join('\n\n');
    expect(parseSubtitles(big)).toEqual({ ok: false, reason: 'too_many_cues' });
  });
});

describe('cue text is plain text', () => {
  const corpus = [
    '<script>alert(1)</script>Hi',
    '<img src=x onerror=alert(1)>Hi',
    '<v <b>>Hi',
    '<b><i>nested <u>unclosed',
    '<c.loud>Hi</c>',
    '<00:00:01.500>Hi',
    'Hi<script',
    'Hi <!-- comment -->',
    '<<script>>Hi',
    '‮Hi‬',
  ];

  it.each(corpus)('yields only literal text with no tag opener: %j', (raw) => {
    const out = normalizeCueText(raw);
    expect(out).not.toMatch(/<[A-Za-z0-9/!?]/);
    expect(out).not.toMatch(/[‪-‮]/);
  });

  it('keeps the text between tags', () => {
    expect(normalizeCueText('<v Ann><i>Hello</i> <b>there</b>')).toBe('Hello there');
  });

  it('decodes only the six entities, after tag removal, in a single pass', () => {
    expect(normalizeCueText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>');
    expect(normalizeCueText('Tom &amp; Jerry&nbsp;&amp;lt;')).toBe('Tom & Jerry &lt;');
    expect(normalizeCueText('&lrm;x&rlm;')).toBe('‎x‏');
    expect(normalizeCueText('&copy; &#60;b&#62;')).toBe('&copy; &#60;b&#62;');
  });

  it('removes control and bidi characters but keeps the line break', () => {
    expect(normalizeCueText('a\u0000b\u0007c‮d‪e⁦f g\nh')).toBe('abcdefg\nh');
  });

  it('keeps at most three lines and 500 characters', () => {
    expect(normalizeCueText('1\n2\n3\n4\n5').split('\n')).toEqual(['1', '2', '3']);
    expect(normalizeCueText('x'.repeat(900))).toHaveLength(500);
    // Never ends on half of a surrogate pair.
    const emoji = normalizeCueText('a' + '😀'.repeat(300));
    const last = emoji.charCodeAt(emoji.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(emoji.length).toBeLessThanOrEqual(500);
  });
});

describe('validateCues', () => {
  const ok = [
    { start: 0, end: 1000, text: 'a' },
    { start: 1000, end: 2000, text: 'b' },
  ];
  it('accepts ordered, positive, bounded cues and normalises their text', () => {
    expect(validateCues([{ start: 0, end: 5, text: '<b>x</b>' }])).toEqual({
      ok: true,
      cues: [{ start: 0, end: 5, text: 'x' }],
    });
    expect(validateCues(ok).ok).toBe(true);
  });
  it('refuses unordered, negative, backwards, empty-text and non-cue input', () => {
    expect(validateCues([ok[1], ok[0]])).toEqual({ ok: false, reason: 'unordered' });
    expect(validateCues([{ start: -1, end: 5, text: 'a' }])).toEqual({ ok: false, reason: 'invalid_cue' });
    expect(validateCues([{ start: 5, end: 5, text: 'a' }])).toEqual({ ok: false, reason: 'invalid_cue' });
    expect(validateCues([{ start: 0, end: 5, text: '<i></i>' }])).toEqual({ ok: false, reason: 'invalid_cue' });
    expect(validateCues('nope')).toEqual({ ok: false, reason: 'no_cues' });
    expect(validateCues([])).toEqual({ ok: false, reason: 'no_cues' });
  });
  it('refuses more than 5,000 cues and more than 512 KB serialised', () => {
    const many = Array.from({ length: 5001 }, (_, i) => ({ start: i, end: i + 1, text: 'a' }));
    expect(validateCues(many)).toEqual({ ok: false, reason: 'too_many_cues' });
    // 4,000 cues of 400 characters is ~1.6 MB.
    const heavy = Array.from({ length: 4000 }, (_, i) => ({ start: i, end: i + 1, text: 'y'.repeat(400) }));
    expect(validateCues(heavy)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('activeCueAt', () => {
  const list = [
    { start: 1000, end: 2000, text: 'a' },
    { start: 2000, end: 3000, text: 'b' },
    { start: 5000, end: 9000, text: 'long' },
    { start: 6000, end: 7000, text: 'inside' },
  ];
  it('shows a cue from its start up to, not including, its end', () => {
    expect(activeCueAt(list, 999)).toBeNull();
    expect(activeCueAt(list, 1000)?.text).toBe('a');
    expect(activeCueAt(list, 1999)?.text).toBe('a');
    expect(activeCueAt(list, 2000)?.text).toBe('b');
    expect(activeCueAt(list, 3000)).toBeNull();
    expect(activeCueAt(list, 4999)).toBeNull();
  });
  it('finds a long cue that overlaps a later short one', () => {
    expect(activeCueAt(list, 6500)?.text).toBe('inside');
    expect(activeCueAt(list, 8000)?.text).toBe('long');
    expect(activeCueAt(list, 9000)).toBeNull();
  });
  it('handles empty lists and bad positions', () => {
    expect(activeCueAt([], 10)).toBeNull();
    expect(activeCueAt(list, -5)).toBeNull();
    expect(activeCueAt(list, Number.NaN)).toBeNull();
  });
});

describe('tags and preferences', () => {
  it('validates a language tag with Intl', () => {
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('pt-br')).toBe('pt-BR');
    expect(normalizeLang('not a tag')).toBeNull();
    expect(normalizeLang('')).toBeNull();
  });
  it('coerces a stored preference defensively', () => {
    expect(coerceSubtitlePrefs(null)).toEqual({ label: null, size: 'medium' });
    expect(coerceSubtitlePrefs({ label: 'English', size: 'large' })).toEqual({ label: 'English', size: 'large' });
    expect(coerceSubtitlePrefs({ label: 5, size: 'huge' })).toEqual({ label: null, size: 'medium' });
  });
});
