import { describe, expect, it } from 'vitest';
import { relayConfig } from '../vm';

describe('relayConfig', () => {
  it('turns the session URL into a Wisp URL with the ticket', () => {
    const r = relayConfig({ url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'abc.def' }, 'ignored', true);
    expect(r.relayUrl).toBe('wisps://rmhstudios.com/rmhos-net/?ticket=abc.def');
  });

  it('uses wisp:// for a plain ws:// relay', () => {
    const r = relayConfig({ url: 'ws://localhost:7005/rmhos-net/', ticket: 't' }, 'x', false);
    expect(r.relayUrl).toBe('wisp://localhost:7005/rmhos-net/?ticket=t');
  });

  it('carries the ticket to the DoH forwarder through the doh_server host string', () => {
    // v86 builds `https://${doh_server}/dns-query`; the trailing `#` swallows the appended path.
    const r = relayConfig({ url: 'wss://rmhstudios.com/rmhos-net/', ticket: 'a.b' }, 'x', true);
    expect(r.dohServer).toBe('rmhstudios.com/rmhos-net/dns-query?ticket=a.b#');
    const url = new URL(`https://${r.dohServer}/dns-query`);
    expect(url.pathname + url.search).toBe('/rmhos-net/dns-query?ticket=a.b');
  });

  it('points at the same origin with no ticket when there is no relay', () => {
    const r = relayConfig(null, 'rmhstudios.com', true);
    expect(r.relayUrl).toBe('wisps://rmhstudios.com/rmhos-net/');
    expect(r.dohServer).not.toContain('ticket');
  });
});
