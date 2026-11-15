import { describe, expect, it } from 'vitest';
import { initialTracker, statusUrl, trackNet, type NetSample } from '../net-status';

function run(samples: NetSample[]) {
  let tracker = initialTracker;
  let state: string = 'connecting';
  for (const s of samples) ({ tracker, state } = trackNet(tracker, s));
  return state;
}
const up = (at: number): NetSample => ({ at, result: { connected: true } });
const down = (at: number): NetSample => ({ at, result: { connected: false } });
const fail = (at: number): NetSample => ({ at, result: 'failed' });

describe('trackNet', () => {
  it('is on when the hub says connected', () => expect(run([up(0)])).toBe('on'));
  it('stays connecting through one or two failures, errors on the third', () => {
    expect(run([fail(0), fail(15)])).toBe('connecting');
    expect(run([fail(0), fail(15_000), fail(30_000)])).toBe('error');
  });
  it('a success resets the failure count', () => {
    expect(run([fail(0), fail(1), up(2), fail(3), fail(4)])).toBe('connecting');
  });
  it('connected:false is connecting for under 30 s, error from 30 s', () => {
    expect(run([down(0), down(15_000)])).toBe('connecting');
    expect(run([down(0), down(15_000), down(30_000)])).toBe('error');
  });
  it('a drop after being online is measured from its first sample, and recovers', () => {
    expect(run([up(0), down(15_000), down(44_999)])).toBe('connecting');
    expect(run([up(0), down(15_000), down(45_000)])).toBe('error');
    expect(run([up(0), down(15_000), up(30_000), down(45_000)])).toBe('connecting');
  });
  it('recovers from error when the socket is back', () => {
    expect(run([down(0), down(30_000), up(45_000)])).toBe('on');
  });
});

describe('statusUrl', () => {
  it('maps the relay URL to the status endpoint with the ticket', () => {
    expect(statusUrl('wss://rmhstudios.com/rmhos-net/', 'a.b.c')).toBe(
      'https://rmhstudios.com/rmhos-net/status?ticket=a.b.c',
    );
    expect(statusUrl('ws://localhost:7009/rmhos-net/?ticket=old', 'x')).toBe(
      'http://localhost:7009/rmhos-net/status?ticket=x',
    );
  });
});
