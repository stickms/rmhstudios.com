'use client';

/**
 * /dunesday — the MCU + Dune marathon planner, presented as Dunesday 7: a
 * Windows 7-style desktop with a logon screen, windows, a file system and
 * apps. The planner itself is unchanged underneath: `lib/dunesday/schedule.ts`
 * schedules, `lib/dunesday/state.ts` holds the plan, and the panels you knew
 * (plan settings, schedule, watch list, sync) are apps on the desktop.
 */

import { DunesdayProvider } from './DunesdayProvider';
import { DunesdayOS } from './os/DunesdayOS';

export function Dunesday() {
  return (
    <DunesdayProvider>
      <DunesdayOS />
    </DunesdayProvider>
  );
}
