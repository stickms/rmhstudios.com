'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const STORAGE_KEY = 'rmh-whatsnew-seen-spatial-rewrite-v1';
const WELCOME_KEY = 'rmh-welcome-seen-v1';
let presentedInThisRuntime = false;

const CHANGES = [
  {
    number: '01',
    key: 'spatial-rewrite-navigation',
    title: 'One navigation plane',
    copy: 'The permanent sidebar is gone. Every space now begins with the same quiet global index.',
  },
  {
    number: '02',
    key: 'spatial-rewrite-palette',
    title: 'Paper, ink, and space',
    copy: 'Color steps back so original work, conversations, and tools can carry the page.',
  },
  {
    number: '03',
    key: 'spatial-rewrite-motion',
    title: 'Depth without noise',
    copy: 'Subtle pointer and scroll parallax create orientation while reduced-motion preferences stay respected.',
  },
] as const;

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
              {t('whatsnew-title-spatial-rewrite', {
                defaultValue: 'RMH, reconsidered.',
              })}
            </DialogTitle>
            <DialogDescription className="spatial-whats-new__description">
              {t('whatsnew-subtitle-spatial-rewrite', {
                defaultValue:
                  'A complete interface rewrite designed to make a very large world feel effortless.',
              })}
            </DialogDescription>
          </div>
          <div className="spatial-whats-new__art" aria-hidden>
            <span />
          </div>
        </div>

        <div className="spatial-whats-new__changes grid grid-cols-1 sm:grid-cols-3">
          {CHANGES.map((change) => (
            <article key={change.key}>
              <span>{change.number}</span>
              <div>
                <h3>{t(`${change.key}-title`, { defaultValue: change.title })}</h3>
                <p>{t(`${change.key}-copy`, { defaultValue: change.copy })}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="spatial-whats-new__footer">
          <span>{t('designed-for-focus', { defaultValue: 'Designed for focus.' })}</span>
          <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => setOpen(false)}>
            {t('enter-new-rmh', { defaultValue: 'Enter the new RMH' })}
            <ArrowUpRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
