'use client';

/** Marathon Calendar — the night-by-night schedule, list or month view. */

import { BareChrome } from '../../AeroWindow';
import { useDunesday } from '../../DunesdayProvider';
import { Schedule } from '../../Schedule';

export default function CalendarApp() {
  const { plan, state, actions, today } = useDunesday();
  return (
    <BareChrome.Provider value>
      <Schedule plan={plan} state={state} actions={actions} today={today} />
    </BareChrome.Provider>
  );
}
