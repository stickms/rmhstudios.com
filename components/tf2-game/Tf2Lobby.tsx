/**
 * The TF2 lobby: play offline against bots (a listen server in a worker, no
 * account needed); host a game for friends — peer-to-peer from this browser
 * or dedicated on the games hub (HostGameCard); or find one in the server
 * browser (ServerBrowser: dedicated and P2P rooms, Quick Play, favorites,
 * join by code). Online play needs a signed-in account. Choosing any of them
 * hands a `Tf2Session` to the play page, which mounts the game. Lives in the
 * TF2 Hub's palette (AppShell `tf2hud-theme`), with the hub's own controls
 * (components/tf2-hud/ui).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import { useSession } from '@/components/Providers';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { Btn, Field, NumberField, SelectField, TextField } from '@/components/tf2-hud/ui';
import { useLobbyInvite } from '@/hooks/useLobbyLink';
import { TF2_MAPS } from '@/lib/tf2-game/data/maps';
import { BOT_DIFFICULTIES, TF2_LIMITS, type BotDifficulty } from '@/lib/tf2-game/net/events';
import type { Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import HostGameCard from './HostGameCard';
import ServerBrowser from './ServerBrowser';

const NAME_KEY = 'rmh:tf2-game:name';

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: the name lasts this visit */
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export default function Tf2Lobby({ onStart }: { onStart: (session: Tf2Session) => void }) {
  const { t } = useTranslation('c-tf2-game');
  const { data: session } = useSession();
  const user = (session as { user?: { id?: string | null; name?: string | null } } | null)?.user;
  const accountName = user?.name ?? '';
  // Online play needs an account; the hub names players by it.
  const userId = user?.id ?? null;
  const signedIn = !!userId;
  const invite = useLobbyInvite();
  const [hubStatus, setHubStatus] = useState('connecting');
  const onHubStatus = useCallback((s: string) => setHubStatus(s), []);
  const [name, setName] = useState('');
  useEffect(() => setName(readName()), []);
  const playerName = (name.trim() || accountName || t('play_default_name', { defaultValue: 'Player' })).slice(0, 32);

  const difficultyLabel = (d: BotDifficulty) =>
    ({
      easy: t('play_diff_easy', { defaultValue: 'Easy' }),
      normal: t('play_diff_normal', { defaultValue: 'Normal' }),
      hard: t('play_diff_hard', { defaultValue: 'Hard' }),
      expert: t('play_diff_expert', { defaultValue: 'Expert' }),
    })[d];

  // Offline.
  const [offMap, setOffMap] = useState(TF2_MAPS[0]?.name ?? 'ctf_2fort');
  const [offBots, setOffBots] = useState(11);
  const [offDiff, setOffDiff] = useState<BotDifficulty>('normal');

  const start = (s: Tf2Session) => {
    if (name.trim()) writeName(name.trim());
    onStart(s);
  };

  // The main column's side padding keeps the cards clear of a landscape phone's notch (--safe-left/right).
  const card = 'rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5';

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header title={t('play_title', { defaultValue: 'Play Team Fortress 2' })} backLabel={t('play_back_hub', { defaultValue: 'Hub' })} backHref="/tf2" />
      <main className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 py-6 pr-[calc(1rem_+_var(--safe-right))] pl-[calc(1rem_+_var(--safe-left))] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={card} aria-labelledby="tf2-offline-title">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="size-5 text-(--app-accent-text)" aria-hidden />
            <h2 id="tf2-offline-title" className="tf2hud-title text-2xl">
              {t('play_offline_title', { defaultValue: 'Offline practice' })}
            </h2>
          </div>
          <p className="mb-4 text-sm text-(--app-text-muted)">
            {t('play_offline_body', {
              defaultValue: 'A match against bots that runs entirely in your browser. No account or connection needed once the map has loaded.',
            })}
          </p>
          <div className="grid gap-3">
            <Field label={t('play_name', { defaultValue: 'Your name' })}>
              <TextField value={name} maxLength={32} placeholder={accountName || t('play_default_name', { defaultValue: 'Player' })} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('play_map', { defaultValue: 'Map' })}>
              <SelectField value={offMap} onChange={(e) => setOffMap(e.target.value)}>
                {TF2_MAPS.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.title}
                  </option>
                ))}
              </SelectField>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('play_bots', { defaultValue: 'Bots' })}>
                <NumberField label={t('play_bots', { defaultValue: 'Bots' })} value={offBots} min={0} max={TF2_LIMITS.MAX_BOTS} onChange={(v) => setOffBots(clampInt(v, 0, TF2_LIMITS.MAX_BOTS))} />
              </Field>
              <Field label={t('play_difficulty', { defaultValue: 'Difficulty' })}>
                <SelectField value={offDiff} onChange={(e) => setOffDiff(e.target.value as BotDifficulty)}>
                  {BOT_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {difficultyLabel(d)}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>
            <Btn
              variant="primary"
              size="md"
              icon={Bot}
              className="mt-1 w-full justify-center"
              onClick={() =>
                start({ kind: 'offline', map: offMap, botCount: offBots, difficulty: offDiff, maxPlayers: Math.max(2, offBots + 1), playerName })
              }
            >
              {t('play_offline_start', { defaultValue: 'Play offline' })}
            </Btn>
          </div>
        </section>

        <HostGameCard
          signedIn={signedIn}
          accountName={accountName || playerName}
          hubReady={hubStatus === 'connected'}
          invite={invite}
          onStart={start}
          difficultyLabel={difficultyLabel}
        />

        <ServerBrowser signedIn={signedIn} userId={userId} invite={invite} onStart={start} onStatus={onHubStatus} />

        <p className="text-center text-xs text-(--app-text-dim) lg:col-span-2">
          {t('play_legal', {
            defaultValue:
              'An independent, clean-room engine. Team Fortress 2 and its content are trademarks and property of Valve Corporation; this fan project is not affiliated with Valve.',
          })}
        </p>
      </main>
    </div>
  );
}
