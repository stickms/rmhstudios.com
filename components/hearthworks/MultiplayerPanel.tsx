'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Crown, LogOut, RefreshCw, UserX } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { useLobbyInvite, useLobbyInviteJoin, useLobbyLink } from '@/hooks/useLobbyLink';
import { lobbyReturnPath } from '@/lib/lobby-link';
import { hearthworksStore } from '@/lib/hearthworks/store';
import { HW_LIMITS } from '@/lib/hearthworks/net/events';
import { ensureLobby, leaveLobby, useLobby } from '@/lib/hearthworks/net/lobby';
import type { LobbyError, LobbyPlayer } from '@/lib/hearthworks/net/connector';

type TFn = ReturnType<typeof useTranslation>['t'];

function errorText(t: TFn, error: LobbyError): string {
  switch (error) {
    case 'auth-required':
      return t('mp-err-auth-required', { defaultValue: 'Sign in to play together.' });
    case 'not-found':
      return t('mp-err-not-found', { defaultValue: 'That room does not exist any more.' });
    case 'full':
      return t('mp-err-full', { defaultValue: 'That room is full.' });
    case 'kicked':
      return t('mp-err-kicked', { defaultValue: 'You were removed from that room.' });
    case 'refused':
      return t('mp-err-refused', { defaultValue: 'The host did not let you in.' });
    case 'host-closed':
      return t('mp-err-host-closed', { defaultValue: 'The host closed the room.' });
    case 'host-lost':
      return t('mp-err-host-lost', { defaultValue: 'The host disappeared and nobody could take over.' });
    case 'relay-overflow':
      return t('mp-err-relay-overflow', { defaultValue: 'Your connection could not keep up.' });
    case 'room-limit':
      return t('mp-err-room-limit', { defaultValue: 'Too many rooms right now. Try again shortly.' });
    case 'rate-limited':
      return t('mp-err-rate-limited', { defaultValue: 'Slow down a moment.' });
    case 'offline':
      return t('mp-err-offline', { defaultValue: 'Could not reach the game server.' });
    case 'timeout':
      return t('mp-err-timeout', { defaultValue: 'Could not connect to the host.' });
    case 'lost':
      return t('mp-err-lost', { defaultValue: 'Lost the connection to the room.' });
    case 'invalid':
      return t('mp-err-invalid', { defaultValue: 'That did not work. Try again.' });
  }
}

function connText(t: TFn, conn: LobbyPlayer['conn']): string {
  switch (conn) {
    case 'direct':
      return t('mp-conn-direct', { defaultValue: 'Direct' });
    case 'turn':
      return t('mp-conn-turn', { defaultValue: 'Via TURN' });
    case 'relay':
      return t('mp-conn-relay', { defaultValue: 'Via relay' });
    default:
      return '';
  }
}

/**
 * Host a world, join one by code, invite link or the room list, and see who is playing. The hub only
 * introduces players; the world runs in the host's browser and moves to another player if the host leaves
 * (lib/hearthworks/net).
 */
export function MultiplayerPanel() {
  const { t } = useTranslation('c-hearthworks');
  const lobby = useLobby();
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const invite = useLobbyInvite();
  const ids = { name: useId(), max: useId(), code: useId() };
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [priv, setPriv] = useState(false);
  const [code, setCode] = useState('');
  const { copied, copyLink } = useLobbyLink({ code: lobby.code, path: '/hearthworks' });

  const idle = lobby.phase === 'idle' || lobby.phase === 'closed';

  const join = useCallback((c: string) => {
    void ensureLobby().then((l) => l.joinRoom(c.trim().toUpperCase()));
  }, []);
  // An invite link opens the game already joining (once the account is known).
  useLobbyInviteJoin(signedIn, join);

  const refresh = useCallback(() => {
    void ensureLobby().then((l) => l.refreshRooms());
  }, []);
  useEffect(() => {
    if (signedIn && idle) refresh();
  }, [signedIn, idle, refresh]);

  const host = () => {
    const world = hearthworksStore.getState().world;
    const roomName = name.trim() || t('mp-name-default', { defaultValue: 'Our world' });
    void ensureLobby().then((l) => l.hostRoom({ name: roomName, maxPlayers, world, private: priv }));
  };

  const title = t('mp-title', { defaultValue: 'Play together' });

  if (!signedIn) {
    return (
      <section className="hw-panel hw-panel--tall" aria-label={title}>
        <h2 className="hw-panel__title">{title}</h2>
        <p className="hw-muted">{t('mp-sign-in', { defaultValue: 'Sign in to host or join a shared world.' })}</p>
        <p>
          <Link className="hw-small hw-small--link" to="/login" search={{ callbackURL: lobbyReturnPath('/hearthworks', invite) }}>
            {t('mp-sign-in-link', { defaultValue: 'Sign in' })}
          </Link>
        </p>
      </section>
    );
  }

  if (!idle) {
    const isHost = lobby.role === 'host';
    const others = lobby.players.filter((p) => !p.you).length;
    const status =
      lobby.phase === 'starting'
        ? t('mp-status-starting', { defaultValue: 'Connecting…' })
        : lobby.phase === 'joining'
          ? t('mp-status-joining', { defaultValue: 'Joining…' })
          : lobby.phase === 'migrating'
            ? t('mp-status-migrating', { defaultValue: 'The host left. Finding a new one…' })
            : isHost
              ? t('mp-status-hosting', { defaultValue: 'You are hosting' })
              : t('mp-status-member', { defaultValue: 'Connected' });
    const leaveLabel = !isHost
      ? t('mp-leave', { defaultValue: 'Leave' })
      : others > 0
        ? t('mp-leave-handover', { defaultValue: 'Hand over and leave' })
        : t('mp-leave-close', { defaultValue: 'Close room' });
    return (
      <section className="hw-panel hw-panel--tall" aria-label={title}>
        <h2 className="hw-panel__title">{lobby.roomName ?? title}</h2>
        <p className="hw-muted" role="status">
          {status}
        </p>
        {lobby.code && (
          <div className="hw-row hw-row--gap">
            <span>
              {t('mp-code', { defaultValue: 'Room code' })} <b className="hw-code">{lobby.code}</b>
            </span>
            <button type="button" className="hw-small" onClick={() => void copyLink()}>
              {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}{' '}
              {copied ? t('mp-copied', { defaultValue: 'Copied' }) : t('mp-copy-link', { defaultValue: 'Copy invite link' })}
            </button>
          </div>
        )}
        <h3 className="hw-panel__sub">{t('mp-roster-title', { defaultValue: 'Players' })}</h3>
        <ul className="hw-list">
          {lobby.players.map((p) => (
            <li key={p.id} className="hw-row">
              <span className="hw-player">
                {p.host && <Crown aria-label={t('mp-host-badge', { defaultValue: 'Host' })} size={14} />}
                {p.name}
                {p.you && <span className="hw-muted"> ({t('mp-you', { defaultValue: 'you' })})</span>}
                {p.successor && <span className="hw-tag">{t('mp-next-badge', { defaultValue: 'Next host' })}</span>}
                {p.conn && <span className="hw-muted"> · {connText(t, p.conn)}</span>}
              </span>
              {isHost && !p.you && (
                <button
                  type="button"
                  className="hw-small"
                  aria-label={t('mp-kick', { defaultValue: 'Remove {{name}}', name: p.name })}
                  onClick={() => void ensureLobby().then((l) => l.kick(p.id))}
                >
                  <UserX aria-hidden size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p>
          <button type="button" className="hw-small" onClick={leaveLobby}>
            <LogOut aria-hidden size={14} /> {leaveLabel}
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="hw-panel hw-panel--tall" aria-label={title}>
      <h2 className="hw-panel__title">{title}</h2>
      {lobby.error && (
        <p className="hw-error" role="alert">
          {errorText(t, lobby.error)}
        </p>
      )}

      <h3 className="hw-panel__sub">{t('mp-host-title', { defaultValue: 'Host this world' })}</h3>
      <p className="hw-muted">
        {t('mp-host-hint', {
          defaultValue: 'Your browser runs the world and friends connect straight to you. If you leave, it moves to another player.',
        })}
      </p>
      <div className="hw-field">
        <label htmlFor={ids.name}>{t('mp-name-label', { defaultValue: 'World name' })}</label>
        <input
          id={ids.name}
          className="hw-input"
          value={name}
          maxLength={HW_LIMITS.NAME_MAX}
          placeholder={t('mp-name-default', { defaultValue: 'Our world' })}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="hw-field">
        <label htmlFor={ids.max}>{t('mp-max-label', { defaultValue: 'Players' })}</label>
        <select id={ids.max} className="hw-input" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
          {Array.from({ length: HW_LIMITS.MAX_PLAYERS - HW_LIMITS.MIN_PLAYERS + 1 }, (_, i) => HW_LIMITS.MIN_PLAYERS + i).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <label className="hw-check">
        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />{' '}
        {t('mp-private-label', { defaultValue: 'Invite only (not listed)' })}
      </label>
      <p>
        <button type="button" className="hw-small" onClick={host}>
          {t('mp-host-button', { defaultValue: 'Host this world' })}
        </button>
      </p>

      <h3 className="hw-panel__sub">{t('mp-join-title', { defaultValue: 'Join a world' })}</h3>
      <form
        className="hw-field hw-field--inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) join(code);
        }}
      >
        <label htmlFor={ids.code} className="hw-sr">
          {t('mp-code-label', { defaultValue: 'Room code' })}
        </label>
        <input
          id={ids.code}
          className="hw-input hw-input--code"
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('mp-code-placeholder', { defaultValue: 'ABC123' })}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit" className="hw-small" disabled={code.trim().length < 6}>
          {t('mp-join-button', { defaultValue: 'Join' })}
        </button>
      </form>

      <div className="hw-row hw-row--gap">
        <h3 className="hw-panel__sub">{t('mp-rooms-title', { defaultValue: 'Open worlds' })}</h3>
        <button type="button" className="hw-small" onClick={refresh} aria-label={t('mp-refresh', { defaultValue: 'Refresh' })}>
          <RefreshCw aria-hidden size={14} />
        </button>
      </div>
      {lobby.rooms.length === 0 ? (
        <p className="hw-muted">{t('mp-rooms-empty', { defaultValue: 'No open worlds right now.' })}</p>
      ) : (
        <ul className="hw-list">
          {lobby.rooms.map((r) => (
            <li key={r.code} className="hw-row">
              <span>
                {r.name}
                <span className="hw-muted">
                  {' '}
                  · {r.host} · {t('mp-room-count', { defaultValue: '{{players}}/{{max}} players', players: r.players, max: r.maxPlayers })}
                </span>
              </span>
              <button type="button" className="hw-small" disabled={r.players >= r.maxPlayers} onClick={() => join(r.code)}>
                {t('mp-join-button', { defaultValue: 'Join' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
