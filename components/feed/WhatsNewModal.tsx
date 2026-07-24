'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const STORAGE_KEY = 'rmh-whatsnew-seen-social-rewrite-v1';
const WELCOME_KEY = 'rmh-welcome-seen-v1';
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
  const [open, setOpen] = useState(false);
  const changes = [
    {
      number: '01',
      key: 'social-rewrite-feed',
      title: t('social-rewrite-feed-title', { defaultValue: 'The feed comes first' }),
      copy: t('social-rewrite-feed-copy', {
        defaultValue:
          'Posts, projects, games, and conversations now meet in one immediate community timeline.',
      }),
    },
    {
      number: '02',
      key: 'social-rewrite-navigation',
      title: t('social-rewrite-navigation-title', {
        defaultValue: 'Every section is one tap away',
      }),
      copy: t('social-rewrite-navigation-copy', {
        defaultValue:
          'Persistent tabs and a thumb-friendly mobile dock keep the whole platform within reach.',
      }),
    },
    {
      number: '03',
      key: 'social-rewrite-theme',
      title: t('social-rewrite-theme-title', { defaultValue: 'A new visual system' }),
      copy: t('social-rewrite-theme-copy', {
        defaultValue:
          'Daylight, Midnight, and High Contrast share crisp surfaces, stronger type, and purposeful motion.',
      }),
    },
  ] as const;

  useEffect(() => {
    if (isPending) return;
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
  }, [isPending, session]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="spatial-whats-new max-w-[58rem] gap-0 overflow-hidden p-0">
        <div className="spatial-whats-new__intro">
          <div className="spatial-whats-new__meta">
            <span>{t('whats-new', { defaultValue: 'What’s new' })}</span>
            <span>26 / 01</span>
          </div>
          <div>
            <DialogTitle className="spatial-whats-new__title">
              {t('whatsnew-title-social-rewrite', {
                defaultValue: 'RMH is social now.',
              })}
            </DialogTitle>
            <DialogDescription className="spatial-whats-new__description">
              {t('whatsnew-subtitle-social-rewrite', {
                defaultValue:
                  'A mobile-first interface built around people, projects, and the things worth sharing.',
              })}
            </DialogDescription>
          </div>
          <div className="spatial-whats-new__art" aria-hidden>
            <span />
          </div>
        </div>

        <div className="spatial-whats-new__changes grid grid-cols-1 sm:grid-cols-3">
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
            {t('enter-new-rmh', { defaultValue: 'Enter the new RMH' })}
            <ArrowUpRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
