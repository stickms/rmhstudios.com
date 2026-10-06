'use client';

/**
 * "Take it with you": the live calendar subscription, the RSS feed and Discord
 * updates. All three read a synced copy of the plan, so the panel opens with a
 * single opt-in and explains what turning it on means.
 */

import {
  CalendarCheck,
  CloudOff,
  CloudUpload,
  Copy,
  ExternalLink,
  MessageSquare,
  Rss,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CloudSync } from './useCloudSync';

async function copy(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

export function Connect({ sync }: { sync: CloudSync }) {
  const { t } = useTranslation('c-dunesday');
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [armedStop, setArmedStop] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const copyFailed = t('copy-failed', {
    defaultValue: 'Couldn’t copy — your browser blocked the clipboard.',
  });

  const statusLabel =
    sync.status === 'saving'
      ? t('sync-saving', { defaultValue: 'Saving…' })
      : sync.status === 'error'
        ? t('sync-error', { defaultValue: 'Couldn’t save — will retry on your next change' })
        : t('sync-saved', { defaultValue: 'Synced' });

  return (
    <section className="ds-window" aria-labelledby="ds-connect-title">
      <div className="ds-titlebar">
        <CalendarCheck size={16} aria-hidden="true" />
        <h2 id="ds-connect-title">
          {t('connect-title', { defaultValue: 'Calendar, RSS & Discord' })}
        </h2>
        {sync.slot && (
          <span className="ds-hint" style={{ marginLeft: 'auto' }} role="status">
            {statusLabel}
          </span>
        )}
        <span
          className="ds-caption-dots"
          aria-hidden="true"
          style={sync.slot ? { marginLeft: 8 } : undefined}
        >
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="ds-window-body ds-stack">
        {!sync.slot ? (
          <div className="ds-stack" style={{ gap: 10 }}>
            <p style={{ margin: 0 }}>
              {t('connect-intro', {
                defaultValue:
                  'Subscribe to your plan in Apple, Google or Outlook Calendar, follow it in any RSS reader, and get tonight’s lineup and your progress posted to a Discord channel. Everything updates by itself as you tick titles off.',
              })}
            </p>
            <p className="ds-hint" style={{ margin: 0 }}>
              {t('connect-privacy', {
                defaultValue:
                  'This saves a copy of your plan on RMH Studios under a private, unguessable link. No account needed. Anyone with the calendar or RSS link can see your watch list, but only this browser can change it. You can turn it off any time, which deletes the copy.',
              })}
            </p>
            <div>
              <button
                type="button"
                className="ds-btn ds-btn--green"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await sync.enable();
                  setBusy(false);
                  if (ok)
                    toast.success(
                      t('sync-on', {
                        defaultValue: 'Sync is on. Your calendar, RSS and Discord links are ready.',
                      }),
                    );
                  else
                    toast.error(
                      t('sync-failed', {
                        defaultValue: 'Couldn’t turn sync on. Try again in a moment.',
                      }),
                    );
                }}
              >
                <CloudUpload size={16} aria-hidden="true" />
                {t('sync-enable', { defaultValue: 'Turn on sync' })}
              </button>
            </div>
          </div>
        ) : (
          <SyncedPanels sync={sync} origin={origin} copyFailed={copyFailed} />
        )}

        {sync.slot && (
          <div className="ds-row ds-no-print">
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              onClick={() =>
                copy(
                  `${origin}/dunesday#sync=${sync.slot!.feedId}.${sync.slot!.token}`,
                  t('device-copied', {
                    defaultValue:
                      'Link copied. Open it on your other device — keep it private, it can edit your plan.',
                  }),
                  copyFailed,
                )
              }
            >
              <Smartphone size={14} aria-hidden="true" />
              {t('device-link', { defaultValue: 'Open on another device' })}
            </button>
            <button
              type="button"
              className={
                armedStop ? 'ds-btn ds-btn--sand ds-btn--sm' : 'ds-btn ds-btn--ghost ds-btn--sm'
              }
              onBlur={() => setArmedStop(false)}
              onClick={async () => {
                if (!armedStop) return setArmedStop(true);
                await sync.disable();
                setArmedStop(false);
                toast.success(
                  t('sync-off', { defaultValue: 'Sync is off and the online copy is deleted.' }),
                );
              }}
            >
              <CloudOff size={14} aria-hidden="true" />
              {armedStop
                ? t('sync-disable-confirm', {
                    defaultValue: 'Click again — links will stop working',
                  })
                : t('sync-disable', { defaultValue: 'Turn off sync' })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SyncedPanels({
  sync,
  origin,
  copyFailed,
}: {
  sync: CloudSync;
  origin: string;
  copyFailed: string;
}) {
  const { t } = useTranslation('c-dunesday');
  const feedId = sync.slot!.feedId;
  const host = origin.replace(/^https?:\/\//, '');
  const icsHttps = `${origin}/api/dunesday/feeds/${feedId}/calendar.ics`;
  const webcal = `webcal://${host}/api/dunesday/feeds/${feedId}/calendar.ics`;
  const rss = `${origin}/api/dunesday/feeds/${feedId}/rss.xml`;
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(icsHttps)}&name=${encodeURIComponent('Dunesday Marathon')}`;

  return (
    <div className="ds-stack">
      <div className="ds-card" style={{ padding: 14 }}>
        <div className="ds-row" style={{ marginBottom: 6 }}>
          <CalendarCheck size={18} aria-hidden="true" />
          <strong>{t('cal-title', { defaultValue: 'Live calendar' })}</strong>
        </div>
        <p className="ds-hint" style={{ margin: '0 0 10px' }}>
          {t('cal-hint', {
            defaultValue:
              'A subscription, not a one-off file: every watch night appears at your start time, and your calendar re-plans itself when you tick titles off or skip a night (calendars refresh every hour or so).',
          })}
        </p>
        <div className="ds-row">
          <a className="ds-btn ds-btn--sm" href={webcal}>
            {t('cal-apple', { defaultValue: 'Apple Calendar' })}
          </a>
          <a className="ds-btn ds-btn--sm" href={google} target="_blank" rel="noopener noreferrer">
            {t('cal-google', { defaultValue: 'Google Calendar' })}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          <a className="ds-btn ds-btn--sm" href={outlook} target="_blank" rel="noopener noreferrer">
            {t('cal-outlook', { defaultValue: 'Outlook' })}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={() =>
              copy(icsHttps, t('cal-copied', { defaultValue: 'Calendar URL copied.' }), copyFailed)
            }
          >
            <Copy size={14} aria-hidden="true" />
            {t('copy-url', { defaultValue: 'Copy URL' })}
          </button>
        </div>
      </div>

      <div className="ds-card" style={{ padding: 14 }}>
        <div className="ds-row" style={{ marginBottom: 6 }}>
          <Rss size={18} aria-hidden="true" />
          <strong>{t('rss-title', { defaultValue: 'RSS feed' })}</strong>
        </div>
        <p className="ds-hint" style={{ margin: '0 0 10px' }}>
          {t('rss-hint', {
            defaultValue:
              'Tonight’s lineup plus every title you finish. Works with any feed reader or RSS-to-anything bridge.',
          })}
        </p>
        <div className="ds-row">
          <input
            className="ds-input"
            style={{ flex: '1 1 240px' }}
            readOnly
            value={rss}
            aria-label={t('rss-title', { defaultValue: 'RSS feed' })}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            onClick={() =>
              copy(rss, t('rss-copied', { defaultValue: 'RSS URL copied.' }), copyFailed)
            }
          >
            <Copy size={14} aria-hidden="true" />
            {t('copy-url', { defaultValue: 'Copy URL' })}
          </button>
          <a
            className="ds-btn ds-btn--ghost ds-btn--sm"
            href={rss}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t('open', { defaultValue: 'Open' })}
          </a>
        </div>
      </div>

      <DiscordCard sync={sync} />
    </div>
  );
}

function DiscordCard({ sync }: { sync: CloudSync }) {
  const { t } = useTranslation('c-dunesday');
  const saved = sync.discord;
  const [url, setUrl] = useState('');
  const [name, setName] = useState(saved?.name ?? '');
  const [daily, setDaily] = useState(saved?.daily ?? true);
  const [progress, setProgress] = useState(saved?.progress ?? true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  // Adopt the server's values once they arrive (restored device, first load).
  useEffect(() => {
    if (!saved) return;
    setName(saved.name ?? '');
    setDaily(saved.daily);
    setProgress(saved.progress);
  }, [saved]);

  const save = async (webhookUrl?: string | null) => {
    setBusy('save');
    const result = await sync.saveDiscord({
      webhookUrl,
      daily,
      progress,
      name: name.trim() || null,
    });
    setBusy(null);
    if (result.ok) {
      setUrl('');
      toast.success(
        webhookUrl === null
          ? t('discord-removed', { defaultValue: 'Discord webhook removed.' })
          : t('discord-saved', { defaultValue: 'Discord settings saved.' }),
      );
    } else
      toast.error(result.error ?? t('discord-save-failed', { defaultValue: 'Couldn’t save.' }));
  };

  return (
    <div className="ds-card" style={{ padding: 14 }}>
      <div className="ds-row" style={{ marginBottom: 6 }}>
        <MessageSquare size={18} aria-hidden="true" />
        <strong>{t('discord-title', { defaultValue: 'Discord updates' })}</strong>
        {saved?.webhook && (
          <span className="ds-tag ds-tag--extra">
            {t('discord-connected', { defaultValue: 'Connected' })}
          </span>
        )}
      </div>
      <p className="ds-hint" style={{ margin: '0 0 10px' }}>
        {t('discord-hint', {
          defaultValue:
            'In Discord: Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL, then paste it here. Great for a watch-party server.',
        })}
      </p>
      <div className="ds-stack" style={{ gap: 10 }}>
        <label className="ds-field">
          <span className="ds-label">
            {saved?.webhook
              ? t('discord-replace', {
                  defaultValue: 'Webhook ({{masked}}) — paste a new one to replace it',
                  masked: saved.webhook,
                })
              : t('discord-url', { defaultValue: 'Webhook URL' })}
          </span>
          <input
            className="ds-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://discord.com/api/webhooks/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="ds-field">
          <span className="ds-label">
            {t('discord-name', { defaultValue: 'Your name in posts (optional)' })}
          </span>
          <input
            className="ds-input"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="ds-check">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span>
            {t('discord-daily', { defaultValue: 'Post tonight’s lineup an hour before I start' })}
          </span>
        </label>
        <label className="ds-check">
          <input
            type="checkbox"
            checked={progress}
            onChange={(e) => setProgress(e.target.checked)}
          />
          <span>
            {t('discord-progress', { defaultValue: 'Post when I finish titles and phases' })}
          </span>
        </label>
        <div className="ds-row">
          <button
            type="button"
            className="ds-btn ds-btn--sm"
            disabled={busy !== null || (!url.trim() && !saved?.webhook)}
            onClick={() => save(url.trim() ? url.trim() : undefined)}
          >
            {t('discord-save', { defaultValue: 'Save' })}
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--sm"
            disabled={busy !== null || (!url.trim() && !saved?.webhook)}
            onClick={async () => {
              setBusy('test');
              const result = await sync.testDiscord(url.trim() || undefined);
              setBusy(null);
              if (result.ok)
                toast.success(
                  t('discord-test-ok', { defaultValue: 'Test message sent — check the channel.' }),
                );
              else
                toast.error(
                  result.error ??
                    t('discord-test-failed', { defaultValue: 'Discord rejected the message.' }),
                );
            }}
          >
            <Send size={14} aria-hidden="true" />
            {t('discord-test', { defaultValue: 'Send a test' })}
          </button>
          {saved?.webhook && (
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm"
              disabled={busy !== null}
              onClick={() => save(null)}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('discord-remove', { defaultValue: 'Remove' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
