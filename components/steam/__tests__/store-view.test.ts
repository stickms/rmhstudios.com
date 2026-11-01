import { describe, expect, it } from 'vitest';
import { planAction, timeUntil } from '../store-view';

describe('timeUntil', () => {
  const now = new Date('2026-11-01T20:15:30.000Z');
  it('splits the time left into whole hours and minutes', () => {
    expect(timeUntil('2026-11-02T00:00:00.000Z', now)).toEqual({ hours: 3, minutes: 44 });
  });
  it('never goes negative once the rotation has passed', () => {
    expect(timeUntil('2026-11-01T19:00:00.000Z', now)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('planAction', () => {
  it('sends a signed-out viewer to sign in for free and paid plans', () => {
    expect(planAction('free', 'current', null)).toBe('signin');
    expect(planAction('starter', 'subscribe', null)).toBe('signin');
  });
  it('marks the plan the viewer is on, and lower plans as included', () => {
    expect(planAction('starter', 'subscribe', 'starter')).toBe('current');
    expect(planAction('free', 'current', 'starter')).toBe('included');
    expect(planAction('starter', 'subscribe', 'pro')).toBe('included');
  });
  it('offers subscribe to free viewers and upgrade to paying ones', () => {
    expect(planAction('starter', 'subscribe', 'free')).toBe('subscribe');
    expect(planAction('pro', 'subscribe', 'starter')).toBe('upgrade');
  });
  it('leaves enterprise as a contact link, signed in or out', () => {
    expect(planAction('enterprise', 'contact', 'pro')).toBe('contact');
    expect(planAction('enterprise', 'contact', null)).toBe('contact');
  });
});
