import { describe, expect, it } from 'vitest';
import { classifyUSLocation } from './us-location';

describe('classifyUSLocation', () => {
  it('explicit country wins', () => {
    expect(classifyUSLocation({ country: 'United States', city: 'New York' }).isUS).toBe(true);
    expect(classifyUSLocation({ country: 'US' }).isUS).toBe(true);
    expect(classifyUSLocation({ country: 'United Kingdom', locationRaw: 'London' }).isUS).toBe(false);
  });
  it('parses "City, ST" raw locations from the gazetteer', () => {
    const r = classifyUSLocation({ locationRaw: 'Charlotte, NC' });
    expect(r).toMatchObject({ isUS: true, city: 'Charlotte', state: 'NC' });
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });
  it('detects Remote US', () => {
    expect(classifyUSLocation({ locationRaw: 'Remote - US' }).remoteStatus).toBe('remote_us');
    expect(classifyUSLocation({ locationRaw: 'Remote (United States)' }).isUS).toBe(true);
    expect(classifyUSLocation({ locationRaw: 'Hybrid - New York, NY' }).remoteStatus).toBe('hybrid');
  });
  it('full state names count', () => {
    expect(classifyUSLocation({ locationRaw: 'Austin, Texas' })).toMatchObject({ isUS: true, state: 'TX' });
  });
  it('known non-US cities are rejected', () => {
    expect(classifyUSLocation({ locationRaw: 'London' }).isUS).toBe(false);
    expect(classifyUSLocation({ locationRaw: 'Toronto, ON' }).isUS).toBe(false);
  });
  it('unknown location is unclear, low confidence', () => {
    const r = classifyUSLocation({ locationRaw: 'Main Campus' });
    expect(r.isUS).toBeNull();
    expect(r.confidence).toBeLessThan(50);
  });
  it('New Mexico is US despite the mexico country hint', () => {
    expect(classifyUSLocation({ locationRaw: 'Albuquerque, New Mexico' })).toMatchObject({ isUS: true, state: 'NM' });
    expect(classifyUSLocation({ locationRaw: 'Mexico City' }).isUS).toBe(false);
  });
});
