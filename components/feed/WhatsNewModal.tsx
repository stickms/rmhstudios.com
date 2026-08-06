'use client';

import { useEffect, useState } from 'react';
import { useCookieConsentAnswered } from '@/components/site/CookieConsent';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { TFunction } from 'i18next';
import {
  CURRENT_RELEASE,
  gridClassFor,
  itemNumber,
  storageKeyFor,
  type WhatsNewItemId,
} from '@/lib/whats-new';

/**
 * Card copy, as literal `t()` calls keyed by item id.
 *
 * `t(item.titleKey)` would be tidier and does not work: `i18next-parser` reads
 * the source statically, so a computed key never lands in `locales/` and every
 * locale serves the English default forever (CLAUDE.md §5). Spelled out here
 * for the same reason `planCopy()` and `featureCopy()` are.
 */
export function releaseCopy(t: TFunction): Record<WhatsNewItemId, { title: string; copy: string }> {
  return {
    'voice-calls': {
      title: t('whatsnew-voice-calls-title', { defaultValue: 'Call each other' }),
      copy: t('whatsnew-voice-calls-copy', {
        defaultValue:
          'Voice calls, straight from a conversation or someone’s profile. Audio goes directly between the two of you — it never passes through us.',
      }),
    },
    'upload-privacy': {
      title: t('whatsnew-upload-privacy-title', { defaultValue: 'Photos travel lighter' }),
      copy: t('whatsnew-upload-privacy-copy', {
        defaultValue:
          'Every image you upload is now losslessly re-compressed, and the location your camera quietly attached is stripped before anyone else can read it.',
      }),
    },
    translations: {
      title: t('whatsnew-translations-title', { defaultValue: 'In your language' }),
      copy: t('whatsnew-translations-copy', {
        defaultValue:
          'Thirteen parts of the site — tournaments, wagers, saves, lists, awards and more — were only ever showing English. They speak all sixteen languages now.',
      }),
    },
    'membership-features': {
      title: t('whatsnew-membership-title', { defaultValue: 'What membership gets you' }),
      copy: t('whatsnew-membership-copy', {
        defaultValue:
          'The store now lists every feature a membership unlocks, and what each tier includes.',
      }),
    },
  };
}

const STORAGE_KEY = storageKeyFor(CURRENT_RELEASE);
const WELCOME_KEY = 'rmh-welcome-seen-v1';
const LANG_KEY = 'rmh-lang-picked-v1';
let presentedInThisRuntime = false;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function WhatsNewModal() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const consentAnswered = useCookieConsentAnswered();
  const [open, setOpen] = useState(false);
  const copy = releaseCopy(t);
  const changes = CURRENT_RELEASE.items.map((id, index) => ({
    key: id,
    number: itemNumber(index),
    title: copy[id].title,
    copy: copy[id].copy,
  }));

  useEffect(() => {
    if (isPending) return;
    // Consent first (audit AUD-010). This announcement used to mount at the
    // same time as the cookie bar and the language modal, painting over the
    // one surface the visitor is legally required to be able to read.
    if (!consentAnswered) return;
    // …and the language picker before this. Read once, on mount: a visitor who
    // has already chosen a language sees the announcement on this visit, and a
    // brand-new one sees it on the next — which is the deferral the audit asked
    // for. Either way it never shares the screen with the other two.
    if (!readStorage(LANG_KEY)) return;
    const unseen = !readStorage(STORAGE_KEY);
    const canIntroduce = !session || Boolean(readStorage(WELCOME_KEY));
    if (presentedInThisRuntime || !unseen || !canIntroduce) return;

    const timer = window.setTimeout(() => {
      presentedInThisRuntime = true;
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // Runtime state still prevents a duplicate presentation.
      }
      setOpen(true);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [isPending, session, consentAnswered]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* No `overflow-hidden` here: the sheet is taller than a phone and has to
          scroll. The clipping the class name implies is `.spatial-whats-new`'s
          job (overflow-x + a rounded scroll container), so the utility only ever
          overrode the primitive's `overflow-y-auto` and stranded the cards. */}
      <DialogContent className="spatial-whats-new max-w-[58rem] gap-0 p-0">
        <div className="spatial-whats-new__intro">
          <div className="spatial-whats-new__meta">
            <span>{t('whats-new', { defaultValue: 'What’s new' })}</span>
            <span>{CURRENT_RELEASE.version}</span>
          </div>
          <div>
            <DialogTitle className="spatial-whats-new__title">
              {t('whatsnew-title-calls', { defaultValue: 'Now you can talk.' })}
            </DialogTitle>
            <DialogDescription className="spatial-whats-new__description">
              {t('whatsnew-subtitle-calls', {
                defaultValue:
                  'Voice calls between any two people, lighter and more private uploads, and thirteen more corners of the site in your own language.',
              })}
            </DialogDescription>
          </div>
          <div className="spatial-whats-new__art" aria-hidden>
            <span />
          </div>
        </div>

        <div className={`spatial-whats-new__changes grid ${gridClassFor(changes.length)}`}>
          {changes.map((change) => (
            <article key={change.key}>
              <span>{change.number}</span>
              <div>
                <h3>{change.title}</h3>
                <p>{change.copy}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="spatial-whats-new__footer">
          <span>{t('designed-for-community', { defaultValue: 'Designed for community.' })}</span>
          <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => setOpen(false)}>
            {t('whatsnew-dismiss', { defaultValue: 'Got it' })}
            <ArrowUpRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
