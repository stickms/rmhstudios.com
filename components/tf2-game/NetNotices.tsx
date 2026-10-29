/**
 * Network notices over the game (TF2): "Host migrated to <name>" after a
 * peer-to-peer host left and the match moved on, the host's gentle "keep this
 * tab open" (a background tab keeps hosting; a closed one hands the match on),
 * and the room becoming yours. Each stays a few seconds (the client drops it).
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { HudNotice } from '@/lib/tf2-game/client/hud-state';
import { useHudState } from './use-hud';

function NoticeText({ n }: { n: HudNotice }) {
  const { t } = useTranslation('c-tf2-game');
  switch (n.kind) {
    case 'host-migrated':
      return <>{t('notice_host_migrated', { defaultValue: 'Host migrated to {{name}}', name: n.name ?? '' })}</>;
    case 'migrating':
      return <>{t('notice_migrating', { defaultValue: 'The host left. Moving the match to {{name}}…', name: n.name ?? '' })}</>;
    case 'hosting':
      return (
        <>
          {t('notice_hosting', {
            defaultValue: "You're hosting this match. Keep this tab open (it can stay in the background).",
          })}
        </>
      );
    case 'you-host':
      return <>{t('notice_you_own', { defaultValue: 'You run this room now (pause menu → Server).' })}</>;
    case 'transfer-failed':
      return <>{t('notice_transfer_failed', { defaultValue: "That player can't take the match (they need a direct or TURN connection)." })}</>;
    default:
      return null;
  }
}

export default function NetNotices() {
  const notices = useHudState().notices;
  if (!notices?.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[calc(var(--safe-top,0px)+3.5rem)] z-20 grid max-w-[min(90vw,32rem)] -translate-x-1/2 gap-1 text-center"
    >
      {notices.map((n) => (
        <p key={n.id} className="rounded-(--app-radius-sm) bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)">
          <NoticeText n={n} />
        </p>
      ))}
    </div>
  );
}
