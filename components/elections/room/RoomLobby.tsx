import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DoorOpen, Lock, Globe, MonitorPlay } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { isRoomCode, ROOM_NAME_MAX } from '@/lib/elections/room-config';
import type { RoomListItem } from '@/lib/elections/rooms';
import type { RoomSource } from './useRoomState';

/**
 * Where a room starts. Three ways in:
 *  - SOLO — your own screen, saved in this browser, nobody else involved.
 *  - PRIVATE — unlisted; only people you give the 8-character code to can come in.
 *  - PUBLIC — listed here for everyone watching this election.
 * Joining needs no account to WATCH; creating a room, chatting and reacting do.
 */
export function RoomLobby({ cycle, onOpen }: { cycle: string; onOpen: (s: RoomSource) => void }) {
  const { t } = useTranslation('c-elections');
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<{ rooms: RoomListItem[] }>({
    queryKey: ['elections-rooms', cycle],
    queryFn: async () => {
      const r = await fetch(`/api/elections/rooms?cycle=${encodeURIComponent(cycle)}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: 20_000,
    staleTime: 5_000,
    retry: 1,
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/elections/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: name.trim(), visibility, cycle }),
      });
      const j = (await res.json().catch(() => null)) as {
        room?: { code: string };
        error?: string;
      } | null;
      if (res.ok && j?.room) onOpen({ kind: 'hosted', code: j.room.code });
      else
        setError(j?.error ?? t('lobby.createFail', { defaultValue: 'Could not create the room.' }));
    } catch {
      setError(t('lobby.createFail', { defaultValue: 'Could not create the room.' }));
    } finally {
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (isRoomCode(c)) onOpen({ kind: 'hosted', code: c });
    else setError(t('lobby.badCode', { defaultValue: 'Room codes are 8 letters and numbers.' }));
  };

  return (
    <div className="el-lobby">
      <div className="el-box el-proj" style={{ margin: 0 }}>
        <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
          <MonitorPlay size={22} aria-hidden style={{ verticalAlign: -3 }} />{' '}
          {t('lobby.solo', { defaultValue: 'Solo room' })}
        </h3>
        <p className="el-eyebrow">
          {t('lobby.soloHint', {
            defaultValue:
              'Your own screen. Streams, graphs, the map and the wire side by side. Saved in this browser.',
          })}
        </p>
        <button type="button" className="el-btn" onClick={() => onOpen({ kind: 'solo' })}>
          {t('lobby.startSolo', { defaultValue: 'Open the situation room' })}
        </button>
      </div>

      <div className="el-box el-proj" style={{ margin: 0 }}>
        <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
          <DoorOpen size={22} aria-hidden style={{ verticalAlign: -3 }} />{' '}
          {t('lobby.host', { defaultValue: 'Host a room' })}
        </h3>
        {session ? (
          <form onSubmit={create} className="el-stack">
            <label className="el-sr" htmlFor="room-name">
              {t('lobby.name', { defaultValue: 'Room name' })}
            </label>
            <input
              id="room-name"
              className="el-input"
              value={name}
              maxLength={ROOM_NAME_MAX}
              placeholder={t('lobby.namePh', { defaultValue: 'Election night with friends' })}
              onChange={(e) => setName(e.target.value)}
            />
            <div
              className="el-pick-row"
              role="group"
              aria-label={t('lobby.visibility', { defaultValue: 'Who can find it' })}
              style={{ margin: 0 }}
            >
              <button
                type="button"
                className="el-btn el-btn--sm"
                aria-pressed={visibility === 'PRIVATE'}
                onClick={() => setVisibility('PRIVATE')}
              >
                <Lock size={13} aria-hidden />{' '}
                {t('lobby.private', { defaultValue: 'Private (code only)' })}
              </button>
              <button
                type="button"
                className="el-btn el-btn--sm"
                aria-pressed={visibility === 'PUBLIC'}
                onClick={() => setVisibility('PUBLIC')}
              >
                <Globe size={13} aria-hidden />{' '}
                {t('lobby.public', { defaultValue: 'Public (listed)' })}
              </button>
            </div>
            <button
              type="submit"
              className="el-btn el-btn--pink"
              disabled={busy || name.trim().length < 2}
            >
              {busy
                ? t('lobby.creating', { defaultValue: 'Creating…' })
                : t('lobby.create', { defaultValue: 'Create room' })}
            </button>
          </form>
        ) : (
          <p className="el-eyebrow">
            <Link
              to="/login"
              search={{ callbackURL: '/elections' }}
              style={{ textDecoration: 'underline' }}
            >
              {t('lobby.signin', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('lobby.signinRest', { defaultValue: 'to host a private or public room.' })}
          </p>
        )}
      </div>

      <div className="el-box el-proj" style={{ margin: 0 }}>
        <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
          {t('lobby.join', { defaultValue: 'Join by code' })}
        </h3>
        <form onSubmit={join} className="el-pick-row" style={{ flexWrap: 'nowrap', margin: 0 }}>
          <label className="el-sr" htmlFor="room-code">
            {t('lobby.code', { defaultValue: 'Room code' })}
          </label>
          <input
            id="room-code"
            className="el-input el-mono"
            style={{ flex: 1, minWidth: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}
            value={code}
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="K7M2QXH9"
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="el-btn el-btn--pink">
            {t('lobby.go', { defaultValue: 'Join' })}
          </button>
        </form>
      </div>

      {error ? (
        <p className="el-eyebrow" role="alert" style={{ gridColumn: '1 / -1' }}>
          {error}
        </p>
      ) : null}

      <div style={{ gridColumn: '1 / -1' }}>
        <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
          {t('lobby.open', { defaultValue: 'Public rooms' })}
        </h3>
        {data && data.rooms.length === 0 ? (
          <p className="el-eyebrow">
            {t('lobby.none', { defaultValue: 'No public rooms yet. Host the first.' })}
          </p>
        ) : (
          <div className="el-cards">
            {(data?.rooms ?? []).map((r) => (
              <article key={r.code} className="el-race el-box" aria-label={r.name}>
                <h4 className="el-race__label">{r.name}</h4>
                <p className="el-eyebrow" style={{ margin: '8px 0 0' }}>
                  {r.owner?.name
                    ? t('room.host', { defaultValue: 'hosted by {{name}}', name: r.owner.name })
                    : ''}{' '}
                  {r.summary ? `· ${r.summary}` : ''}
                </p>
                <footer className="el-race__foot">
                  <span className="el-mono">{r.code}</span>
                  <button
                    type="button"
                    className="el-btn el-btn--sm el-btn--pink"
                    onClick={() => onOpen({ kind: 'hosted', code: r.code })}
                  >
                    {t('lobby.joinRoom', { defaultValue: 'Join' })}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
