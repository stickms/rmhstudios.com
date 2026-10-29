/**
 * The pause menu's **Server** view (TF2): the room's administration for the player who runs it —
 * the peer-to-peer host (this browser runs the match) or a dedicated room's owner (the hub checks
 * every action again and logs it). Reachable from the pause menu on every device, touch included.
 *
 *   - Players: each human with how they reach the host (Direct / TURN / Relayed, ping, loss), and
 *     Kick (refused for the room's life) and Make host (peer-to-peer: the match moves to their
 *     browser) / Make owner (a hub room);
 *   - the map (`changelevel` among the published maps — everyone reloads it and keeps their seat);
 *   - the match settings (the console's mp_timelimit, mp_winlimit, tf_bot_quota, tf_bot_difficulty);
 *   - the door: lock to new players, a password for new players;
 *   - a server message (`rcon say`).
 *
 * Offline there is nobody to administer: only the map and the settings show.
 */
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, LogOut, Send, UserX } from 'lucide-react';
import { Btn, EmptyNote, Field, Row, SelectField, TextField, Toggle } from '@/components/tf2-hud/ui';
import { TF2_MAPS } from '@/lib/tf2-game/data/maps';
import { DIFFICULTY_WORDS } from '@/lib/tf2-game/console/server-commands';
import type { HudAdminPlayer } from '@/lib/tf2-game/client/hud-state';
import { useHudContext, useHudState } from './use-hud';

function ConnectionLabel({ p }: { p: HudAdminPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  if (p.self) return <span>{t('admin_you', { defaultValue: 'You' })}</span>;
  if (p.held) return <span>{t('p2p_seat_held', { defaultValue: 'Reconnecting' })}</span>;
  const kind =
    p.connection === 'relayed'
      ? t('scores_link_relayed', { defaultValue: 'Relayed' })
      : p.connection === 'turn'
        ? t('scores_link_turn', { defaultValue: 'TURN' })
        : p.connection === 'direct'
          ? t('scores_link_direct', { defaultValue: 'Direct' })
          : null;
  return (
    <span className="tabular-nums">
      {kind}
      {p.pingMs !== undefined && p.pingMs !== null ? ` · ${t('admin_ping', { defaultValue: '{{n}} ms', n: Math.round(p.pingMs) })}` : ''}
      {p.loss ? ` · ${t('admin_loss', { defaultValue: '{{n}}% loss', n: Math.round(p.loss * 100) })}` : ''}
    </span>
  );
}

export default function ServerAdminView() {
  const { t } = useTranslation('c-tf2-game');
  const admin = useHudState().admin;
  const [map, setMap] = useState(admin?.map ?? '');
  if (!admin) return <EmptyNote>{t('admin_none', { defaultValue: 'Only the host or the room owner can change the server.' })}</EmptyNote>;
  return <AdminBody key={admin.role} map={map} setMap={setMap} />;
}

function AdminBody({ map, setMap }: { map: string; setMap: (m: string) => void }) {
  const { t } = useTranslation('c-tf2-game');
  const { store } = useHudContext();
  const admin = useHudState().admin!;
  const [password, setPassword] = useState('');
  const [say, setSay] = useState('');
  const send = (cmd: Parameters<typeof store.send>[0]) => store.send(cmd);
  const extra = (command: string, value: string | number) => send({ kind: 'extra', command, args: [String(value)] });
  const p2p = admin.role === 'host' && admin.online;
  const others = admin.players.filter((p) => !p.self);

  return (
    <div className="grid gap-4 text-sm">
      {admin.online ? (
        <section className="grid gap-2" aria-label={t('admin_players', { defaultValue: 'Players' })}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--app-text-dim)">{t('admin_players', { defaultValue: 'Players' })}</h3>
          {others.length === 0 ? (
            <EmptyNote>{t('p2p_players_empty', { defaultValue: 'Nobody has joined yet. Share the invite link.' })}</EmptyNote>
          ) : (
            <ul className="grid gap-1">
              {others.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    {p.successor ? (
                      <span className="ml-2 text-xs text-(--app-text-dim)">{t('admin_successor', { defaultValue: 'next host' })}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-(--app-text-dim)">
                    <ConnectionLabel p={p} />
                  </span>
                  {(p2p ? p.canHost : p.account) ? (
                    <Btn
                      size="xs"
                      variant="ghost"
                      icon={Crown}
                      onClick={() => send({ kind: 'admin', action: { action: 'transfer', playerId: p.id } })}
                      aria-label={
                        p2p
                          ? t('admin_make_host_named', { defaultValue: 'Make {{name}} the host', name: p.name })
                          : t('admin_make_owner_named', { defaultValue: 'Make {{name}} the owner', name: p.name })
                      }
                    >
                      {p2p ? t('admin_make_host', { defaultValue: 'Make host' }) : t('admin_make_owner', { defaultValue: 'Make owner' })}
                    </Btn>
                  ) : null}
                  <Btn
                    size="xs"
                    variant="ghost"
                    icon={UserX}
                    onClick={() => send({ kind: 'admin', action: { action: 'kick', playerId: p.id } })}
                    aria-label={t('p2p_kick_named', { defaultValue: 'Kick {{name}}', name: p.name })}
                  >
                    {t('p2p_kick', { defaultValue: 'Kick' })}
                  </Btn>
                </li>
              ))}
            </ul>
          )}
          {p2p ? (
            <p className="text-xs text-(--app-text-dim)">
              {t('admin_migration_note', {
                defaultValue: 'If you leave, the match moves to the next host (it keeps going for everyone else).',
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-2" aria-label={t('admin_map', { defaultValue: 'Map' })}>
        <Field label={t('admin_map', { defaultValue: 'Map' })}>
          <div className="flex gap-2">
            <SelectField value={map} onChange={(e) => setMap(e.target.value)} aria-label={t('admin_map', { defaultValue: 'Map' })}>
              {TF2_MAPS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.title}
                </option>
              ))}
            </SelectField>
            <Btn size="sm" disabled={map === admin.map} onClick={() => send({ kind: 'admin', action: { action: 'changelevel', map } })}>
              {t('admin_change_map', { defaultValue: 'Change map' })}
            </Btn>
          </div>
        </Field>
      </section>

      <section className="grid gap-1" aria-label={t('admin_settings', { defaultValue: 'Match settings' })}>
        <Row label={t('admin_timelimit', { defaultValue: 'Time limit (minutes, 0 = none)' })}>
          <SelectField defaultValue="" onChange={(e) => e.target.value !== '' && extra('mp_timelimit', e.target.value)} aria-label={t('admin_timelimit', { defaultValue: 'Time limit (minutes, 0 = none)' })}>
            <option value="">—</option>
            {[0, 10, 15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={String(n)}>
                {String(n)}
              </option>
            ))}
          </SelectField>
        </Row>
        <Row label={t('admin_winlimit', { defaultValue: 'Win limit (rounds, 0 = none)' })}>
          <SelectField defaultValue="" onChange={(e) => e.target.value !== '' && extra('mp_winlimit', e.target.value)} aria-label={t('admin_winlimit', { defaultValue: 'Win limit (rounds, 0 = none)' })}>
            <option value="">—</option>
            {[0, 1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={String(n)}>
                {String(n)}
              </option>
            ))}
          </SelectField>
        </Row>
        <Row label={t('admin_bots', { defaultValue: 'Bots' })}>
          <SelectField defaultValue="" onChange={(e) => e.target.value !== '' && extra('tf_bot_quota', e.target.value)} aria-label={t('admin_bots', { defaultValue: 'Bots' })}>
            <option value="">—</option>
            {[0, 2, 4, 6, 8, 10, 12, 16, 22].map((n) => (
              <option key={n} value={String(n)}>
                {String(n)}
              </option>
            ))}
          </SelectField>
        </Row>
        <Row label={t('admin_difficulty', { defaultValue: 'Bot difficulty' })}>
          <SelectField defaultValue="" onChange={(e) => e.target.value !== '' && extra('tf_bot_difficulty', e.target.value)} aria-label={t('admin_difficulty', { defaultValue: 'Bot difficulty' })}>
            <option value="">—</option>
            {DIFFICULTY_WORDS.map((d, i) => (
              <option key={d} value={String(i)}>
                {d === 'easy'
                  ? t('difficulty_easy', { defaultValue: 'Easy' })
                  : d === 'normal'
                    ? t('difficulty_normal', { defaultValue: 'Normal' })
                    : d === 'hard'
                      ? t('difficulty_hard', { defaultValue: 'Hard' })
                      : t('difficulty_expert', { defaultValue: 'Expert' })}
              </option>
            ))}
          </SelectField>
        </Row>
      </section>

      {admin.online ? (
        <section className="grid gap-2" aria-label={t('admin_door', { defaultValue: 'Who may join' })}>
          <Row label={t('admin_lock', { defaultValue: 'Locked (no new players)' })}>
            <Toggle
              checked={admin.locked}
              onChange={(locked) => send({ kind: 'admin', action: { action: 'lock', locked } })}
              label={t('admin_lock', { defaultValue: 'Locked (no new players)' })}
            />
          </Row>
          <Field
            label={t('admin_password', { defaultValue: 'Password for new players' })}
            hint={admin.passworded ? t('admin_password_set', { defaultValue: 'A password is set. Save an empty one to clear it.' }) : undefined}
          >
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send({ kind: 'admin', action: { action: 'password', password: password.slice(0, 32) } });
                setPassword('');
              }}
            >
              <TextField
                type="password"
                autoComplete="new-password"
                maxLength={32}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label={t('admin_password', { defaultValue: 'Password for new players' })}
              />
              <Btn size="sm" type="submit">
                {t('admin_save', { defaultValue: 'Save' })}
              </Btn>
            </form>
          </Field>
          <Field label={t('admin_say', { defaultValue: 'Message everyone (as the server)' })}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = say.trim();
                if (text) send({ kind: 'admin', action: { action: 'say', text: text.slice(0, 127) } });
                setSay('');
              }}
            >
              <TextField maxLength={127} value={say} onChange={(e) => setSay(e.target.value)} aria-label={t('admin_say', { defaultValue: 'Message everyone (as the server)' })} />
              <Btn size="sm" type="submit" icon={Send} aria-label={t('admin_send', { defaultValue: 'Send' })} />
            </form>
          </Field>
        </section>
      ) : null}
      {p2p && others.some((p) => p.canHost) ? (
        <p className="flex items-center gap-2 text-xs text-(--app-text-dim)">
          <LogOut className="size-4" aria-hidden />
          {t('admin_leave_note', { defaultValue: 'Leave from the menu and the next host takes over.' })}
        </p>
      ) : null}
    </div>
  );
}
