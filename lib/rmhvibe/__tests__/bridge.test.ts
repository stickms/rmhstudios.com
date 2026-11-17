import { describe, expect, it } from 'vitest';
import { parseBridgeMessage } from '../bridge';
import { BRIDGE_MARKER, ensureBridgeRuntime } from '../bridge-runtime';

const req = (op: unknown, args: unknown, id: unknown = 1) => ({ __rmhvibe: 1, id, op, args });

describe('parseBridgeMessage', () => {
  it('rejects malformed messages', () => {
    const bad: unknown[] = [
      null,
      'store.get',
      { id: 1, op: 'store.get', args: { key: 'a', scope: 'page' } },
      req('store.get', { key: 'a', scope: 'page' }, -1),
      req('store.get', { key: 'a', scope: 'page' }, 1.5),
      req('eval', {}),
      req('store.get', { key: 'a b', scope: 'page' }),
      req('store.get', { key: 'a'.repeat(65), scope: 'page' }),
      req('store.set', { key: 'a', scope: 'page', value: 'x'.repeat(4096) }),
      req('store.incr', { key: 'a', scope: 'page', by: 1001 }),
      req('store.incr', { key: 'a', scope: 'page', by: 0.5 }),
      req('store.list', { prefix: '', scope: 'page', order: 'key', limit: 0 }),
      req('store.list', { prefix: '', scope: 'page', order: 'key', limit: 101 }),
      req('room.send', { data: 'x'.repeat(2049) }),
    ];
    for (const m of bad) expect(parseBridgeMessage(m)).toBeNull();
  });

  it('accepts a valid example of each op', () => {
    const good = [
      req('store.get', { key: 'score', scope: 'page' }),
      req('store.set', { key: 'score', scope: 'user', value: { n: 1 } }),
      req('store.incr', { key: 'hits', scope: 'page', by: 1, oncePerUser: true }),
      req('store.list', { prefix: 'hi:', scope: 'page', order: 'value-desc', limit: 10 }),
      req('room.send', { data: { x: 1 } }),
      req('room.members', {}),
    ];
    for (const m of good) expect(parseBridgeMessage(m)).toEqual(m);
  });

  it('parses frame events', () => {
    const err = { __rmhvibe: 1, event: 'error', data: { message: 'boom', source: 'a.js' } };
    expect(parseBridgeMessage(err)).toEqual(err);
    expect(parseBridgeMessage({ __rmhvibe: 1, event: 'ready' })).toMatchObject({ event: 'ready' });
    expect(
      parseBridgeMessage({ __rmhvibe: 1, event: 'error', data: { message: 'x'.repeat(501) } }),
    ).toBeNull();
    expect(parseBridgeMessage({ __rmhvibe: 1, event: 'hello', data: {} })).toBeNull();
  });
});

describe('ensureBridgeRuntime', () => {
  const html =
    '<html><head><title>t</title></head><body><div id="root"></div><script type="module">x()</script></body></html>';

  it('inserts one marker, before the module script, even when called twice', () => {
    const once = ensureBridgeRuntime(html);
    const twice = ensureBridgeRuntime(once);
    expect(twice).toBe(once);
    expect(twice.split(BRIDGE_MARKER).length - 1).toBe(1);
    expect(twice.indexOf(BRIDGE_MARKER)).toBeLessThan(twice.indexOf('<script type="module"'));
  });

  it('falls back to </head>, then to the start', () => {
    const noModule = ensureBridgeRuntime('<html><head></head><body>hi</body></html>');
    expect(noModule.indexOf(BRIDGE_MARKER)).toBeLessThan(noModule.indexOf('</head>'));
    expect(ensureBridgeRuntime('<p>hi</p>').startsWith('<script')).toBe(true);
  });
});
