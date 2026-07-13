import { describe, expect, it } from 'vitest';
import { isDigestDue, isQuietTime } from './schedule';

describe('RMHLadder alert schedule', () => {
  it('honors overnight quiet hours in the user timezone', () => {
    const prefs = { digestFrequency: 'immediate', timezone: 'America/New_York', quietHoursStart: 22, quietHoursEnd: 7 };
    expect(isQuietTime(prefs, new Date('2026-07-13T06:00:00Z'))).toBe(true); // 02:00 EDT
    expect(isQuietTime(prefs, new Date('2026-07-13T14:00:00Z'))).toBe(false); // 10:00 EDT
  });

  it('sends daily and weekly digests only in the local morning slot', () => {
    const mondayMorning = new Date('2026-07-13T13:00:00Z'); // 09:00 EDT
    expect(isDigestDue({ digestFrequency: 'daily', timezone: 'America/New_York' }, mondayMorning)).toBe(true);
    expect(isDigestDue({ digestFrequency: 'weekly', timezone: 'America/New_York' }, mondayMorning)).toBe(true);
    expect(isDigestDue({ digestFrequency: 'weekly', timezone: 'America/New_York' }, new Date('2026-07-14T13:00:00Z'))).toBe(false);
  });
});
