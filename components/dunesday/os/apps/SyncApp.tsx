/** Sync Center — cloud sync, the live calendar, RSS and Discord. */

import { BareChrome } from '../../AeroWindow';
import { Connect } from '../../Connect';
import { useDunesday } from '../../DunesdayProvider';

export default function SyncApp() {
  const { sync } = useDunesday();
  return (
    <BareChrome value>
      <Connect sync={sync} />
    </BareChrome>
  );
}
