import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff } from 'lucide-react';
import type { ElectionEvent } from '@/lib/elections/events';
import {
  DEFAULT_ALERTS,
  alertTitle,
  parseAlertPrefs,
  shouldAlert,
  toggleState,
  type AlertPrefs,
} from '@/lib/elections/alerts';
import { STATE_CODES, stateName } from '@/lib/elections/states';

const KEY = 'rmh-elections-alerts';

type Perm = 'unsupported' | 'default' | 'granted' | 'denied';
const readPerm = (): Perm => (typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Perm));

/** Alert choices, kept in this browser. */
export function useAlertPrefs(): [AlertPrefs, (next: AlertPrefs) => void] {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERTS);
  useEffect(() => {
    try {
      setPrefs(parseAlertPrefs(localStorage.getItem(KEY)));
    } catch {
      /* private mode: defaults for this visit */
    }
  }, []);
  const set = (next: AlertPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [prefs, set];
}

/** Raise a browser notification for each live event the viewer asked about (once per event, only while permitted). */
export function useElectionAlerts(events: ElectionEvent[], prefs: AlertPrefs): void {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (readPerm() !== 'granted') return;
    for (const ev of events) {
      // Only events that arrived live: opening the page mid-night must not replay the evening.
      if (!ev.fresh || seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      if (!shouldAlert(ev, prefs)) continue;
      try {
        new Notification(alertTitle(ev), { body: ev.text, tag: ev.id });
      } catch {
        /* some mobile browsers only allow notifications from a service worker */
      }
    }
  }, [events, prefs]);
}

export function AlertsPanel({ prefs, onChange }: { prefs: AlertPrefs; onChange: (p: AlertPrefs) => void }) {
  const { t } = useTranslation('c-elections');
  const [perm, setPerm] = useState<Perm>('default');
  useEffect(() => setPerm(readPerm()), []);

  const enable = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm((await Notification.requestPermission()) as Perm);
  };

  return (
    <section className="el-alerts el-box el-proj" aria-label={t('alerts.title', { defaultValue: 'Alerts' })}>
      <h3 className="el-drawer__title" style={{ fontSize: 24 }}>
        {perm === 'granted' ? <Bell size={20} aria-hidden style={{ verticalAlign: -3, marginRight: 8 }} /> : <BellOff size={20} aria-hidden style={{ verticalAlign: -3, marginRight: 8 }} />}
        {t('alerts.title', { defaultValue: 'Alerts' })}
      </h3>
      {perm === 'unsupported' ? (
        <p className="el-eyebrow">
          {t('alerts.unsupported', { defaultValue: 'This browser can’t show notifications. On iPhone, add this page to your Home Screen first.' })}
        </p>
      ) : perm === 'denied' ? (
        <p className="el-eyebrow">
          {t('alerts.denied', { defaultValue: 'Notifications are blocked for this site. Allow them in your browser settings, then reload.' })}
        </p>
      ) : perm !== 'granted' ? (
        <>
          <p className="el-eyebrow">
            {t('alerts.lede', { defaultValue: 'Get a notification when something big happens — while this page is open.' })}
          </p>
          <button type="button" className="el-btn el-btn--sm el-btn--pink" onClick={enable}>
            <Bell size={14} aria-hidden />
            {t('alerts.enable', { defaultValue: 'Turn on alerts' })}
          </button>
        </>
      ) : (
        <>
          <div className="el-pick-row" role="group" aria-label={t('alerts.what', { defaultValue: 'What to alert' })}>
            <button type="button" className="el-btn el-btn--sm" aria-pressed={prefs.major} onClick={() => onChange({ ...prefs, major: !prefs.major })}>
              {t('alerts.major', { defaultValue: 'Big moments' })}
            </button>
            <button type="button" className="el-btn el-btn--sm" aria-pressed={prefs.calls} onClick={() => onChange({ ...prefs, calls: !prefs.calls })}>
              {t('alerts.calls', { defaultValue: 'Every call' })}
            </button>
          </div>
          <div className="el-pick-row" style={{ marginTop: 10 }}>
            <label className="el-sr" htmlFor="el-alert-state">{t('alerts.follow', { defaultValue: 'Follow a state' })}</label>
            <select
              id="el-alert-state"
              className="el-input"
              value=""
              onChange={(e) => e.target.value && onChange({ ...prefs, states: toggleState(prefs.states, e.target.value) })}
              style={{ minHeight: 36 }}
            >
              <option value="">{t('alerts.follow', { defaultValue: 'Follow a state' })}…</option>
              {STATE_CODES.filter((c) => !prefs.states.includes(c)).map((c) => (
                <option key={c} value={c}>{stateName(c)}</option>
              ))}
            </select>
            {prefs.states.map((s) => (
              <button key={s} type="button" className="el-btn el-btn--sm" aria-pressed onClick={() => onChange({ ...prefs, states: toggleState(prefs.states, s) })} aria-label={t('alerts.unfollow', { defaultValue: 'Stop following {{state}}', state: stateName(s) })}>
                {s} ×
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
