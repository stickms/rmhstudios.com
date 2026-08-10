'use client';

/**
 * Getting the schedule into the calendar app people actually look at.
 *
 * Two different things, and the difference is the whole point of this panel:
 *
 * - **Subscribe** hands the client a `webcal://` URL that it re-polls forever.
 *   Move a session and everyone's phone follows. This is what you want, and it
 *   is what the `webcal:` scheme buys — Apple Calendar and Outlook both
 *   register it, so the link opens the subscribe dialog directly instead of
 *   downloading a file the user then has to import.
 * - **Download** grabs a one-time `.ics` snapshot. Convenient, and permanently
 *   wrong the moment anything changes — so it is the secondary action.
 *
 * Google Calendar has no `webcal:` handler on the web, so it gets its own link
 * into the "add by URL" screen with the feed pre-filled.
 */

import { CalendarPlus, Copy, Download, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopy } from './state';

interface SubscribePanelProps {
  /** Absolute `https://` URL of the feed, from the server. */
  feedUrl: string;
  scheduleNote: string;
}

export function SubscribePanel({ feedUrl, scheduleNote }: SubscribePanelProps) {
  const { t } = useTranslation('r-pf2ecal');
  const copy = useCopy();

  // `webcal:` is not a real protocol — it is `https:` with a scheme that tells
  // the OS "this is a subscription, not a download". Swapping the scheme is the
  // entire trick.
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  return (
    <section
      className="pf2e-card p-4"
      aria-label={t('add-to-calendar', { defaultValue: 'Add to your calendar' })}
    >
      <h2 className="pf2e-title mb-1 flex items-center gap-2">
        <CalendarPlus size={17} aria-hidden />
        {t('add-to-calendar', { defaultValue: 'Add to your calendar' })}
      </h2>
      <p className="pf2e-caption mb-3">
        {scheduleNote}.{' '}
        {t('subscribe-blurb', {
          defaultValue:
            'Subscribing keeps it in sync — edits here show up on your phone without re-importing.',
        })}
      </p>

      <div className="flex flex-wrap gap-2">
        <a className="pf2e-btn pf2e-btn-primary pf2e-btn-sm" href={webcalUrl}>
          <CalendarPlus size={14} aria-hidden />
          {t('subscribe', { defaultValue: 'Subscribe' })}
        </a>
        <a
          className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm"
          href={googleUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          <Link2 size={14} aria-hidden />
          {t('google-calendar', { defaultValue: 'Google Calendar' })}
        </a>
        <a
          className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm"
          href={feedUrl}
          download="pathfinder-2e.ics"
        >
          <Download size={14} aria-hidden />
          {t('download-ics', { defaultValue: 'Download .ics' })}
        </a>
        <button
          type="button"
          className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
          onClick={() => copy(feedUrl, 'Feed URL')}
        >
          <Copy size={14} aria-hidden />
          {t('copy-feed-url', { defaultValue: 'Copy feed URL' })}
        </button>
      </div>

      <p className="pf2e-caption mt-3">
        {t('feed-url-warning', {
          defaultValue:
            'Anyone with the feed URL can read the schedule, so treat it like the page itself.',
        })}
      </p>
    </section>
  );
}
