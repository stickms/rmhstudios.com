import { describe, expect, it } from 'vitest';
import { encodeCommand, parseMessages, toTap } from './channel';

describe('engine harness channel', () => {
  it('encodes one command per line', () => {
    expect(encodeCommand('c1', 'start_run', { seed: 'ABC' })).toBe(
      '{"id":"c1","cmd":"start_run","args":{"seed":"ABC"}}\n',
    );
    expect(encodeCommand('c2', 'ping')).toBe('{"id":"c2","cmd":"ping","args":[]}\n');
  });

  it('rejects names that the Lua side would not dispatch', () => {
    expect(() => encodeCommand('c1', 'Start-Run')).toThrow(/bad command name/);
    expect(() => encodeCommand('c1', '')).toThrow(/bad command name/);
    expect(() => encodeCommand('a b', 'ping')).toThrow(/bad command id/);
  });

  it('never emits a raw newline inside a line (JSON escapes it)', () => {
    const line = encodeCommand('c1', 'give', { key: 'a\nb' });
    expect(line.slice(0, -1)).not.toContain('\n');
  });

  it('parses every message kind and reports bad lines instead of throwing', () => {
    const text = [
      '{"t":"ready","version":"1.0.1o-FULL"}',
      '{"t":"res","id":"c1","ok":true,"data":"pong"}',
      '{"t":"spec","r":{"name":"a > b","ok":false,"msg":"boom","ms":3}}',
      'not json',
      '{"t":"unknown"}',
      '',
      '{"t":"crash","msg":"main.lua:1: oops"}',
      '{"t":"res","ok":false,"data":{"error":"bad command line"}}',
    ].join('\n');
    const { messages, bad } = parseMessages(text);
    expect(messages.map((m) => m.t)).toEqual(['ready', 'res', 'spec', 'crash', 'res']);
    expect(bad).toEqual(['not json', '{"t":"unknown"}']);
  });

  it('prints TAP with failures expanded', () => {
    const tap = toTap({
      passed: 1,
      failed: 1,
      skipped: 1,
      reports: {},
      tests: [
        { name: 'x > ok', ok: true, ms: 5 },
        { name: 'x > bad', ok: false, msg: 'line1\nline2', ms: 1 },
        { name: 'x > skip', ok: true, skip: true, ms: 0 },
      ],
    });
    expect(tap.split('\n')).toEqual([
      'TAP version 13',
      'ok 1 - x > ok (5 ms)',
      'not ok 2 - x > bad',
      '  ---',
      '  # line1',
      '  # line2',
      '  ...',
      'ok 3 - x > skip # SKIP',
      '1..3',
      '# passed 1, failed 1, skipped 1',
    ]);
  });
});
