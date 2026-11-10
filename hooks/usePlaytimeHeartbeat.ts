/**
 * Credits playtime for `gameId` while the user is signed in: the heartbeat loop
 * (`lib/playtime/heartbeat-loop.ts`), its input signal, and the card-drop toast a
 * beat can return. The site mounts it through `PlaytimeTracker` (which works out
 * the title from the URL); a separately built island (redesign audit B1) calls it
 * with its own catalog id, so both credit playtime the same way.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { GrantedDrop } from '@/lib/cards/types';
import { startHeartbeatLoop } from '@/lib/playtime/heartbeat-loop';

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;

export function usePlaytimeHeartbeat(gameId: string | null, signedIn: boolean): void {
  const { t } = useTranslation('games-hub');

  useEffect(() => {
    if (!signedIn || !gameId) return;
    const loop = startHeartbeatLoop({
      gameId,
      send: (id) => {
        void fetch('/api/games/playtime', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ gameId: id }),
          keepalive: true,
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ drops?: GrantedDrop[] }>) : null))
          .then((body) => {
            // A trading card dropped: say so, with a way to see it.
            for (const d of body?.drops ?? []) {
              toast(
                d.foil
                  ? t('steam-card-drop-foil', {
                      defaultValue: 'Foil card drop: {{name}}',
                      name: d.name,
                    })
                  : t('steam-card-drop', { defaultValue: 'Card drop: {{name}}', name: d.name }),
                {
                  action: {
                    label: t('steam-card-drop-view', { defaultValue: 'View' }),
                    onClick: () => window.location.assign('/games/inventory'),
                  },
                },
              );
            }
          })
          .catch(() => {});
      },
      isVisible: () => document.visibilityState === 'visible',
      now: () => Date.now(),
    });
    // Input handlers fire constantly (pointermove); one write per second is plenty.
    let last = 0;
    const onInput = () => {
      const t = Date.now();
      if (t - last < 1000) return;
      last = t;
      loop.noteInput();
    };
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    return () => {
      loop.stop();
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
    };
  }, [signedIn, gameId, t]);
}
