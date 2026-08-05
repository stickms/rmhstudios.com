/**
 * Massive March — the front screen.
 *
 * Three doors, and no fourth: start a walk, join one by code, or resume one you
 * own. There is no browse list and no matchmaking, which is a design decision
 * rather than an omission (§4) — the campaign assumes a mostly consistent group
 * coming back over several sessions, and a stranger dropped into hour nine of
 * somebody's private vocabulary is not a player, they are an interruption.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, Plus, Trash2, Users } from 'lucide-react';
import { GameBackLink } from '@/components/shared/GameBackLink';
import { VARIANT_MIN_CREW, type WorldVariant } from '@/lib/massive-march/constants';
import { LAND, TOY } from '@/lib/massive-march/palette';
import { mm } from '@/lib/massive-march/net/client';
import { useMmStore } from '@/lib/massive-march/store';
import { TOTAL_ORBS } from '@/lib/massive-march/world/sites';
import { PUZZLE_SITES } from '@/lib/massive-march/world/sites';
import { BOARD, Choose, Field, MarchButton, Panel, TextInput, Toggle } from '../ui';

const ERROR_TEXT: Record<string, string> = {
  'no-such-session': 'No walk with that code. The host has to be online.',
  'session-full': 'That walk is full.',
  'not-your-campaign': 'Only the host can open that campaign.',
  'sign-in-required': 'You need to be signed in.',
  'host-left': 'The host closed the walk.',
  'server-busy': 'Too many walks right now. Try again shortly.',
  'create-failed': 'Could not create the campaign. Try again.',
};

export function MainMenu({ connecting }: { connecting: boolean }) {
  const { t } = useTranslation('c-massive-march');
  const campaigns = useMmStore((s) => s.campaigns);
  const loading = useMmStore((s) => s.campaignsLoading);
  const error = useMmStore((s) => s.error);
  const setError = useMmStore((s) => s.setError);

  const [tab, setTab] = useState<'start' | 'join'>('start');
  const [name, setName] = useState('');
  const [variant, setVariant] = useState<WorldVariant>('solo');
  const [allowSkip, setAllowSkip] = useState(false);
  const [code, setCode] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!connecting) mm.list();
  }, [connecting]);

  async function remove(campaignId: string) {
    setDeleting(campaignId);
    try {
      await fetch('/api/massive-march/campaigns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      mm.list();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="app-page relative" style={{ background: LAND.waterDeep }}>
      <GameBackLink to="/games" />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 pt-[calc(4rem+var(--safe-top))] pb-10">
        <header className="text-center" style={{ color: BOARD }}>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            {t('title', { defaultValue: 'Massive March' })}
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed opacity-85">
            {t('tagline', {
              defaultValue:
                'One handcrafted island, on your own or with up to eleven friends, and no way to solve anything without telling somebody what you can see.',
            })}
          </p>
        </header>

        {error ? (
          <Panel
            className="flex items-center justify-between gap-3"
            style={{ borderColor: TOY.red }}
            role="status"
          >
            <span className="text-sm font-bold">{ERROR_TEXT[error] ?? error}</span>
            <MarchButton tone="ghost" style={{ color: TOY.black }} onClick={() => setError(null)}>
              {t('dismiss', { defaultValue: 'OK' })}
            </MarchButton>
          </Panel>
        ) : null}

        <Panel className="space-y-4">
          <div className="flex gap-2">
            <MarchButton
              tone={tab === 'start' ? 'primary' : 'plain'}
              className="flex-1"
              onClick={() => setTab('start')}
            >
              <Plus aria-hidden className="mr-1 inline size-4" />
              {t('start-tab', { defaultValue: 'Start a walk' })}
            </MarchButton>
            <MarchButton
              tone={tab === 'join' ? 'primary' : 'plain'}
              className="flex-1"
              onClick={() => setTab('join')}
            >
              <Users aria-hidden className="mr-1 inline size-4" />
              {t('join-tab', { defaultValue: 'Join with a code' })}
            </MarchButton>
          </div>

          {tab === 'start' ? (
            <div className="space-y-4">
              <Field label={t('name-label', { defaultValue: 'Call it something' })}>
                <TextInput
                  value={name}
                  maxLength={48}
                  placeholder={t('name-placeholder', { defaultValue: 'A long walk' })}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field
                label={t('variant-label', { defaultValue: 'How many of you, reliably?' })}
                hint={t('variant-hint', {
                  defaultValue:
                    'Pick the smallest number that will actually turn up. More people can always join a smaller world; fewer people cannot finish a bigger one.',
                })}
              >
                <Choose<WorldVariant>
                  label={t('variant-label', { defaultValue: 'How many of you, reliably?' })}
                  value={variant}
                  onChange={setVariant}
                  options={[
                    {
                      value: 'solo',
                      label: t('variant-solo', { defaultValue: 'Just me' }),
                      hint: t('variant-solo-hint', {
                        defaultValue: 'The whole island, one pair of hands. Nobody to wait for.',
                      }),
                    },
                    {
                      value: 'duo',
                      label: t('variant-duo', { defaultValue: 'Two' }),
                      hint: t('variant-duo-hint', { defaultValue: 'Focused. Everyone is essential.' }),
                    },
                    {
                      value: 'trio',
                      label: t('variant-trio', { defaultValue: 'Three' }),
                      hint: t('variant-trio-hint', { defaultValue: 'Room for a relay.' }),
                    },
                    {
                      value: 'band',
                      label: t('variant-band', { defaultValue: 'Four or more' }),
                      hint: t('variant-band-hint', { defaultValue: 'An expedition. Louder.' }),
                    },
                  ]}
                />
              </Field>

              <Toggle
                checked={allowSkip}
                onChange={setAllowSkip}
                label={t('skip-label', { defaultValue: 'Allow challenges to be skipped' })}
                hint={t('skip-hint', {
                  defaultValue:
                    'Some challenges specifically need hearing, speaking, quick reactions or precise aim. Turning this on lets the host step past one without ending the campaign.',
                })}
              />

              <MarchButton
                tone="primary"
                className="w-full"
                disabled={connecting}
                onClick={() => mm.create({ name: name.trim(), variant, allowSkip })}
              >
                {connecting
                  ? t('connecting', { defaultValue: 'Connecting…' })
                  : t('create', { defaultValue: 'Open the island' })}
              </MarchButton>
              <p className="text-xs opacity-70">
                {variant === 'solo'
                  ? t('variant-crew-solo', {
                      defaultValue:
                        'Puzzles will light up one place at a time. Friends can still join — the island just will not wait for them.',
                    })
                  : t('variant-crew', {
                      defaultValue: 'Puzzles will light up for {{count}} people at a time.',
                      count: VARIANT_MIN_CREW[variant],
                    })}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Field
                label={t('code-label', { defaultValue: 'Join code' })}
                hint={t('code-hint', {
                  defaultValue: 'The host has this on screen. They need to be online for it to work.',
                })}
              >
                <TextInput
                  value={code}
                  maxLength={8}
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="ABC123"
                  className="text-center text-2xl font-black tracking-[0.4em]"
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
              </Field>
              <MarchButton
                tone="primary"
                className="w-full"
                disabled={code.trim().length < 4 || connecting}
                onClick={() => mm.join(code)}
              >
                {t('join', { defaultValue: 'Walk over' })}
              </MarchButton>
            </div>
          )}
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black tracking-[0.14em] uppercase">
              {t('saves', { defaultValue: 'Campaigns' })}
            </h2>
            {loading ? <Loader2 aria-hidden className="size-4 animate-spin opacity-60" /> : null}
          </div>

          {campaigns.length === 0 ? (
            <p className="text-sm opacity-70">
              {t('no-saves', {
                defaultValue: 'Nothing yet. A campaign appears here once you have started or joined one.',
              })}
            </p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((campaign) => (
                <li
                  key={campaign.id}
                  className="flex flex-wrap items-center gap-3 border-2 px-3 py-2"
                  style={{ borderColor: 'rgba(34,32,29,0.3)', borderRadius: 3 }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{campaign.name}</span>
                    <span className="block text-xs opacity-70">
                      {t('save-line', {
                        defaultValue: '{{solved}} of {{sites}} done · {{orbs}} of {{total}} given · hosted by {{host}}',
                        solved: campaign.solved,
                        sites: PUZZLE_SITES.length,
                        orbs: campaign.orbs,
                        total: TOTAL_ORBS,
                        host: campaign.hostName,
                      })}
                    </span>
                  </span>

                  {campaign.owned ? (
                    <MarchButton tone="plain" onClick={() => mm.resume(campaign.id)}>
                      <Play aria-hidden className="mr-1 inline size-3.5" />
                      {campaign.finished
                        ? t('revisit', { defaultValue: 'Revisit' })
                        : t('resume', { defaultValue: 'Resume' })}
                    </MarchButton>
                  ) : (
                    <MarchButton
                      tone="plain"
                      disabled={!campaign.live}
                      onClick={() => mm.join(campaign.code)}
                    >
                      {campaign.live
                        ? t('rejoin', { defaultValue: 'Rejoin' })
                        : t('host-offline', { defaultValue: 'Host offline' })}
                    </MarchButton>
                  )}

                  {campaign.owned ? (
                    <button
                      type="button"
                      aria-label={t('delete', { defaultValue: 'Delete campaign' })}
                      className="cursor-pointer p-2 opacity-60 transition-opacity duration-150 hover:opacity-100"
                      disabled={deleting === campaign.id}
                      onClick={() => void remove(campaign.id)}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel tone="dark" className="space-y-2 text-sm leading-relaxed">
          <h2 className="text-xs font-black tracking-[0.14em] uppercase opacity-70">
            {t('agreement-title', { defaultValue: 'Before you start' })}
          </h2>
          <p className="opacity-85">
            {t('agreement-body', {
              defaultValue:
                'Use the game’s own voice or text and nothing else. Half of these puzzles are built out of walls you cannot talk through and distances you cannot shout across — an outside call on the side deletes them, and you will not even notice it happening.',
            })}
          </p>
          <p className="opacity-85">
            {t('agreement-room', {
              defaultValue:
                'If two of you are in the same room, use headphones and separate rooms if you can. The island cannot muffle a person sitting next to you.',
            })}
          </p>
        </Panel>
      </div>
    </div>
  );
}
