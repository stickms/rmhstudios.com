/**
 * Doctrine Engine — Temporal Monopoly (Sahur Mode)
 *
 * Time-gated feature detection for the 3:00-3:59 AM Sahur window.
 */

import { SAHUR_WINDOW } from './constants';
import type { SahurStatus, SahurModeConfig } from './types';

/**
 * Check if Sahur Mode is currently active for a given timezone.
 */
export function isSahurActive(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
    return hour === SAHUR_WINDOW.startHour;
  } catch {
    return false;
  }
}

/**
 * Get time remaining in current Sahur window, or time until next Sahur.
 */
export function getSahurStatus(timezone: string): SahurStatus {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value);

    if (hour === SAHUR_WINDOW.startHour) {
      // Currently in Sahur window
      const minutesRemaining = 60 - minute;
      return { active: true, minutesRemaining, nextSahurAt: null };
    }

    // Calculate next Sahur
    const nextSahur = getNextSahurTime(timezone);
    const minutesUntil = Math.floor((nextSahur.getTime() - now.getTime()) / 60_000);
    return { active: false, minutesRemaining: minutesUntil, nextSahurAt: nextSahur };
  } catch {
    return { active: false, minutesRemaining: 0, nextSahurAt: null };
  }
}

/**
 * Get the next Sahur activation time for a timezone.
 */
function getNextSahurTime(timezone: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value);

  // If we're past 3 AM today, next Sahur is tomorrow at 3 AM
  const tomorrow = hour >= SAHUR_WINDOW.startHour;
  const target = new Date(now);
  if (tomorrow) target.setDate(target.getDate() + 1);

  // Set to 3:00 AM in the user's timezone
  // This is approximate — for display purposes only
  const diff = SAHUR_WINDOW.startHour - hour;
  target.setHours(target.getHours() + diff);
  target.setMinutes(0, 0, 0);

  return target;
}

/**
 * Get full Sahur Mode configuration when active.
 */
export function getSahurConfig(timezone: string): SahurModeConfig | null {
  const status = getSahurStatus(timezone);
  if (!status.active) return null;

  return {
    active: true,
    theme: 'sahur',
    xpMultiplier: SAHUR_WINDOW.xpMultiplier,
    greeting: SAHUR_WINDOW.greeting,
    minutesRemaining: status.minutesRemaining,
  };
}

/**
 * Get all standard IANA timezones where Sahur is currently active.
 * Used by the background worker to broadcast activations.
 */
export function getTimezonesInSahurWindow(): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.filter(tz => isSahurActive(tz));
}
