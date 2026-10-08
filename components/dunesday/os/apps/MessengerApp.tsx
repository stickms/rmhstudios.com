'use client';

/** Dunesday Messenger — the AI buddy, in a Windows Live Messenger-style window. */

import { BuddyChat } from '../../Buddy';
import type { AppProps } from '../apps';

export default function MessengerApp({ win }: AppProps) {
  return <BuddyChat initialQuestion={win.params?.ask} />;
}
