import { describe, expect, it } from 'vitest';
import {
  AUTO_REPLY_MAX,
  AUTO_REPLY_PREFIX,
  CALL_ANSWER_MODES,
  CALL_BUSY_NOTE_MAX,
  DEFAULT_CALL_ANSWER_MODE,
  autoReplyContent,
  buildAutoReplyPrompt,
  fallbackAutoReply,
  isCallAnswerMode,
  normalizeBusyNote,
  ringsPhone,
  sanitizeAutoReply,
  shouldAutoReply,
  type AutoReplyTrigger,
} from '@/lib/call/answer';

const TRIGGERS: AutoReplyTrigger[] = ['busy', 'missed', 'unavailable'];

describe('call answer modes', () => {
  it('defaults to ringing normally, so nothing automatic happens until asked for', () => {
    expect(DEFAULT_CALL_ANSWER_MODE).toBe('ring');
    for (const t of TRIGGERS) expect(shouldAutoReply('ring', t)).toBe(false);
  });

  it('only accepts the three known modes', () => {
    for (const m of CALL_ANSWER_MODES) expect(isCallAnswerMode(m)).toBe(true);
    for (const bad of ['', 'RING', 'dnd', null, undefined, 1, 'toString']) {
      expect(isCallAnswerMode(bad)).toBe(false);
    }
  });

  it('ring_reply replies when busy or unanswered, never for the do-not-ring case', () => {
    expect(shouldAutoReply('ring_reply', 'busy')).toBe(true);
    expect(shouldAutoReply('ring_reply', 'missed')).toBe(true);
    expect(shouldAutoReply('ring_reply', 'unavailable')).toBe(false);
  });

  it('reply_only never rings, and replies instead', () => {
    expect(ringsPhone('reply_only')).toBe(false);
    expect(ringsPhone('ring')).toBe(true);
    expect(ringsPhone('ring_reply')).toBe(true);
    expect(shouldAutoReply('reply_only', 'unavailable')).toBe(true);
    expect(shouldAutoReply('reply_only', 'busy')).toBe(true);
  });

  it('has no trigger for a call the user declined themselves', () => {
    // A deliberate decline is not an automatic-reply moment: the type has no
    // such trigger, so no mode can send one.
    expect(TRIGGERS).not.toContain('declined' as AutoReplyTrigger);
  });
});

describe('busy note', () => {
  it('is stored as one trimmed line, bounded, or null', () => {
    expect(normalizeBusyNote('  in   class\nuntil 3 ')).toBe('in class until 3');
    expect(normalizeBusyNote('   ')).toBeNull();
    expect(normalizeBusyNote(undefined)).toBeNull();
    expect(normalizeBusyNote(42)).toBeNull();
    expect(normalizeBusyNote('x'.repeat(CALL_BUSY_NOTE_MAX + 50))).toHaveLength(CALL_BUSY_NOTE_MAX);
  });

  it('drops control and direction-override characters', () => {
    expect(normalizeBusyNote('a\u0000b\u202ec\u200bd')).toBe('a b c d');
  });
});

describe('sanitizing the writer output', () => {
  it('strips wrapping quotes and a repeated label', () => {
    expect(sanitizeAutoReply('"Auto-reply: I am in a meeting."')).toBe('I am in a meeting.');
  });

  it('rejects links, so the fallback is used instead', () => {
    for (const bad of [
      'Call me back, see https://evil.example/x',
      'Details at www.example.org',
      'DM me at evil.com',
    ]) {
      expect(sanitizeAutoReply(bad)).toBeNull();
    }
  });

  it('rejects empty and non-string output', () => {
    expect(sanitizeAutoReply('')).toBeNull();
    expect(sanitizeAutoReply('   ')).toBeNull();
    expect(sanitizeAutoReply(undefined)).toBeNull();
    expect(sanitizeAutoReply({})).toBeNull();
  });

  it('caps length, preferring a sentence boundary over a word cut', () => {
    const long = `${'I am away from my desk right now. '.repeat(20)}`;
    const out = sanitizeAutoReply(long);
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(AUTO_REPLY_MAX);
    expect(out as string).toMatch(/[.!?]$/);
  });

  it('always labels what is sent as automatic', () => {
    expect(autoReplyContent('Back soon.')).toBe(`${AUTO_REPLY_PREFIX}Back soon.`);
    expect(AUTO_REPLY_PREFIX.toLowerCase()).toContain('auto');
  });
});

describe('fallback reply', () => {
  it('says why for each trigger, and uses the note verbatim', () => {
    expect(fallbackAutoReply('busy', 'in class until 3')).toBe(
      "I'm on another call right now. in class until 3",
    );
    expect(fallbackAutoReply('missed', null)).toBe(
      "Sorry I couldn't pick up your call. I'll get back to you when I can.",
    );
    expect(fallbackAutoReply('unavailable', null)).toContain('not taking calls');
  });
});

describe('writer prompt', () => {
  it('never contains the caller, only the situation and the callee’s own note', () => {
    const { system, user } = buildAutoReplyPrompt('busy', 'at the dentist');
    expect(user).toContain('at the dentist');
    // There is no parameter for a caller: a display name is where an injection hides.
    expect(buildAutoReplyPrompt.length).toBe(2);
    expect(system).toContain('DATA');
    expect(system).toMatch(/not an instruction/i);
  });

  it('fences the note and handles its absence', () => {
    expect(buildAutoReplyPrompt('missed', 'x').user).toMatch(/<<<[\s\S]*>>>/);
    expect(buildAutoReplyPrompt('missed', null).user).toContain('none given');
  });
});
