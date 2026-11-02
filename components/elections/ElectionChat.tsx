import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SendHorizontal, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { MAX_CHAT_LENGTH, type ChatMessage } from '@/lib/elections/chat';

const KEEP = 200;

/**
 * The live room. Reads over Server-Sent Events (EventSource reconnects on its
 * own), writes over a rate-limited POST. Signed-out visitors can read; posting
 * needs an account. No links are allowed in messages (server-enforced) — the
 * rule is shown up front so a rejection is never a surprise.
 */
export function ElectionChat({ year }: { year: number }) {
  const { t } = useTranslation('c-elections');
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setStatus('offline');
      return;
    }
    setMsgs([]);
    setStatus('connecting');
    const es = new EventSource(`/api/elections/chat/stream?cycle=${year}`);
    es.onopen = () => setStatus('live');
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    es.addEventListener('history', (e) => {
      try {
        setMsgs(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore a malformed frame */
      }
    });
    es.addEventListener('msg', (e) => {
      try {
        const m = JSON.parse((e as MessageEvent).data) as ChatMessage;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m].slice(-KEEP)));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('del', (e) => {
      try {
        const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
        setMsgs((cur) => cur.filter((x) => x.id !== id));
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [year]);

  // Follow new messages unless the reader has scrolled up to read.
  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/elections/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text: body, cycle: String(year) }),
      });
      if (res.ok) {
        setText('');
        stick.current = true;
      } else if (res.status === 429) {
        setError(t('chat.slow', { defaultValue: 'Slow down a little.' }));
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? t('chat.fail', { defaultValue: 'Could not send that.' }));
      }
    } catch {
      setError(t('chat.fail', { defaultValue: 'Could not send that.' }));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) =>
    fetch(`/api/elections/chat?cycle=${year}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => undefined);

  return (
    <div className="el-box el-proj" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
      <p className="el-eyebrow" style={{ margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className={`el-chip ${status === 'live' ? 'el-chip--gop' : 'el-chip--ink'}`}>
          {status === 'live'
            ? t('chat.live', { defaultValue: 'Live chat' })
            : status === 'connecting'
              ? t('chat.connecting', { defaultValue: 'Connecting…' })
              : t('chat.offline', { defaultValue: 'Offline' })}
        </span>
        <span>{t('chat.rules', { defaultValue: 'Plain text · no links · be decent' })}</span>
      </p>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('chat.log', { defaultValue: 'Election chat' })}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        style={{ height: 320, overflowY: 'auto', border: '2px solid var(--el-ink)', background: 'var(--el-paper-2)', padding: 10 }}
      >
        {msgs.length === 0 ? (
          <p className="el-eyebrow" style={{ margin: 0 }}>
            {t('chat.empty', { defaultValue: 'Quiet so far. Say something.' })}
          </p>
        ) : (
          msgs.map((m) => (
            <p key={m.id} style={{ margin: '0 0 8px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              <strong>{m.name}</strong>{' '}
              <span>{m.text}</span>
              {isAdmin ? (
                <button
                  type="button"
                  className="el-btn el-btn--sm el-btn--ghost"
                  style={{ minHeight: 24, padding: '0 6px', marginLeft: 6 }}
                  aria-label={t('chat.delete', { defaultValue: 'Delete message' })}
                  onClick={() => remove(m.id)}
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              ) : null}
            </p>
          ))
        )}
      </div>

      {session ? (
        <form onSubmit={send} style={{ marginTop: 10 }} className="el-stack">
          <div className="el-pick-row" style={{ flexWrap: 'nowrap', margin: 0 }}>
            <label className="el-sr" htmlFor="el-chat">{t('chat.label', { defaultValue: 'Message' })}</label>
            <input
              id="el-chat"
              className="el-input"
              style={{ flex: 1, minWidth: 0 }}
              value={text}
              maxLength={MAX_CHAT_LENGTH}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              placeholder={t('chat.ph', { defaultValue: 'Say something…' })}
            />
            <button type="submit" className="el-btn el-btn--pink" disabled={busy || !text.trim()} aria-label={t('chat.send', { defaultValue: 'Send' })}>
              <SendHorizontal size={16} aria-hidden />
            </button>
          </div>
          {error ? <p className="el-eyebrow" role="alert" style={{ margin: 0 }}>{error}</p> : null}
        </form>
      ) : (
        <p className="el-eyebrow" style={{ marginTop: 10 }}>
          <Link to="/login" search={{ callbackURL: '/elections' }} style={{ textDecoration: 'underline' }}>
            {t('chat.signin', { defaultValue: 'Sign in' })}
          </Link>{' '}
          {t('chat.signinRest', { defaultValue: 'to join the conversation.' })}
        </p>
      )}
    </div>
  );
}
