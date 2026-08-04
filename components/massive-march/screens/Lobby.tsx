/**
 * Massive March — the lobby.
 *
 * Barely a lobby: there is no ready check and no start button in the usual
 * sense, because the campaign has no rounds to start. This screen exists to hand
 * out the join code, show who has arrived, let the host change the two settings
 * they own, and put everybody on the beach.
 *
 * It is also where the microphone question is asked, once, before anybody is
 * standing in a world where the answer matters.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Crown, Mic, MicOff } from 'lucide-react';
import { MIN_PLAYERS } from '@/lib/massive-march/constants';
import { avatarColor } from '@/lib/massive-march/palette';
import { LAND } from '@/lib/massive-march/palette';
import { mm } from '@/lib/massive-march/net/client';
import { useMmSettings } from '@/lib/massive-march/settings';
import { useMmStore } from '@/lib/massive-march/store';
import { startVoice } from '@/lib/massive-march/voice';
import { BOARD, Chip, INK, MarchButton, Panel, Toggle } from '../ui';

export function Lobby() {
  const { t } = useTranslation('c-massive-march');
  const session = useMmStore((s) => s.session);
  const selfSocketId = useMmStore((s) => s.selfSocketId);
  const setScreen = useMmStore((s) => s.setScreen);
  const textOnly = useMmSettings((s) => s.textOnly);
  const setSetting = useMmSettings((s) => s.set);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!session) return null;
  const isHost = session.hostSocketId === selfSocketId;
  const enough = session.members.filter((m) => m.connected).length >= MIN_PLAYERS;

  function walk() {
    // Voice is started from this click, deliberately: every browser suspends an
    // AudioContext and refuses a microphone until a real user gesture, and
    // asking for one mid-walk is a permission prompt over a first-person camera.
    if (selfSocketId) void startVoice(selfSocketId);
    setScreen('world');
  }

  return (
    <div className="app-page relative" style={{ background: LAND.waterDeep }}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 pt-[calc(2.5rem+var(--safe-top))] pb-10">
        <header style={{ color: BOARD }}>
          <p className="text-xs font-black tracking-[0.2em] uppercase opacity-70">
            {t('lobby-eyebrow', { defaultValue: 'The landing' })}
          </p>
          <h1 className="text-3xl font-black tracking-tight">{session.name}</h1>
        </header>

        <Panel className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="block text-[11px] font-bold tracking-[0.14em] uppercase opacity-70">
                {t('code-title', { defaultValue: 'Join code' })}
              </span>
              <span className="block text-4xl font-black tracking-[0.3em]">{session.code}</span>
            </div>
            <MarchButton
              onClick={() => {
                void navigator.clipboard?.writeText(session.code).then(() => setCopied(true));
              }}
            >
              {copied ? (
                <Check aria-hidden className="mr-1 inline size-4" />
              ) : (
                <Copy aria-hidden className="mr-1 inline size-4" />
              )}
              {copied ? t('copied', { defaultValue: 'Copied' }) : t('copy', { defaultValue: 'Copy' })}
            </MarchButton>
          </div>
          <p className="text-xs opacity-70">
            {t('code-note', {
              defaultValue:
                'Anyone with this can walk in while you are online. Close the session and everybody goes home — the island keeps its progress.',
            })}
          </p>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-sm font-black tracking-[0.14em] uppercase">
            {t('who', { defaultValue: 'Who is here' })}{' '}
            <span className="opacity-60">
              {session.members.length}/{session.maxPlayers}
            </span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {session.members.map((member) => (
              <li
                key={member.socketId}
                className="flex items-center gap-3 border-2 px-3 py-2"
                style={{ borderColor: 'rgba(34,32,29,0.3)', borderRadius: 3, opacity: member.connected ? 1 : 0.5 }}
              >
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-full border-2"
                  style={{ background: avatarColor(member.slot), borderColor: INK }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{member.name}</span>
                {member.isHost ? (
                  <Crown aria-hidden className="size-4 shrink-0 opacity-70" />
                ) : null}
              </li>
            ))}
          </ul>
          {!enough ? (
            <p className="text-xs opacity-70">
              {t('need-two', {
                defaultValue:
                  'Nothing on the island can be solved alone. Wait for at least one more before walking off.',
              })}
            </p>
          ) : null}
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-sm font-black tracking-[0.14em] uppercase">
            {t('talking', { defaultValue: 'How you will talk' })}
          </h2>
          <Toggle
            checked={textOnly}
            onChange={(next) => setSetting('textOnly', next)}
            label={t('text-only', { defaultValue: 'Text only — never open my microphone' })}
            hint={t('text-only-hint', {
              defaultValue:
                'Typed messages travel exactly as far as speech does, fade the same way, and are blocked by the same walls. You can finish the whole campaign this way.',
            })}
          />
          <p className="flex items-center gap-2 text-xs opacity-70">
            {textOnly ? (
              <MicOff aria-hidden className="size-4 shrink-0" />
            ) : (
              <Mic aria-hidden className="size-4 shrink-0" />
            )}
            {textOnly
              ? t('mic-off-note', { defaultValue: 'You will still hear everyone who speaks.' })
              : t('mic-on-note', {
                  defaultValue: 'Hold V to talk. You can change that in settings once you are out there.',
                })}
          </p>
        </Panel>

        {isHost ? (
          <Panel className="space-y-3">
            <h2 className="text-sm font-black tracking-[0.14em] uppercase">
              {t('host-settings', { defaultValue: 'Host settings' })}
            </h2>
            <Toggle
              checked={session.allowSkip}
              onChange={(next) => mm.settings({ allowSkip: next })}
              label={t('skip-label', { defaultValue: 'Allow challenges to be skipped' })}
              hint={t('skip-hint-lobby', {
                defaultValue:
                  'You can change this at any time. A skipped challenge still produces its red rounds.',
              })}
            />
          </Panel>
        ) : (
          <Panel tone="dark">
            <p className="text-sm opacity-85">
              {t('guest-note', {
                defaultValue:
                  'The host owns this campaign and has to be online for it to continue. Everything you do out there is saved to their island.',
              })}
            </p>
          </Panel>
        )}

        <div className="flex flex-wrap gap-3">
          <MarchButton tone="primary" className="flex-1" onClick={walk}>
            {t('walk', { defaultValue: 'Walk out' })}
          </MarchButton>
          <MarchButton
            tone="danger"
            onClick={() => {
              mm.leave();
              useMmStore.getState().leave();
            }}
          >
            {t('leave', { defaultValue: 'Leave' })}
          </MarchButton>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip>
            {t('variant-chip', {
              defaultValue: 'World for {{variant}}',
              variant:
                session.variant === 'duo'
                  ? t('variant-duo', { defaultValue: 'Two' })
                  : session.variant === 'trio'
                    ? t('variant-trio', { defaultValue: 'Three' })
                    : t('variant-band', { defaultValue: 'Four or more' }),
            })}
          </Chip>
          {session.allowSkip ? (
            <Chip>{t('skip-chip', { defaultValue: 'Skipping allowed' })}</Chip>
          ) : null}
        </div>
      </div>
    </div>
  );
}
