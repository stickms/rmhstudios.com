'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Grid2X2, Move3D, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

// A new key intentionally reintroduces the announcement for the redesign.
const STORAGE_KEY = 'rmh-whatsnew-seen-spatial-v1';
const WELCOME_KEY = 'rmh-welcome-seen-v1';
let presentedInThisRuntime = false;

function getStoredValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function markAsPresented() {
  presentedInThisRuntime = true;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // The runtime flag still prevents duplicate presentation in this session.
  }
}

const FEATURES = [
  {
    icon: ScanLine,
    titleKey: 'spatial-feature-space-title',
    titleDefault: 'More space',
  },
  {
    icon: Grid2X2,
    titleKey: 'spatial-feature-system-title',
    titleDefault: 'One visual language',
  },
  {
    icon: Move3D,
    titleKey: 'spatial-feature-motion-title',
    titleDefault: 'Motion with purpose',
  },
] as const;

/**
 * One-time editorial introduction to the spatial-minimal redesign. Signed-out
 * visitors can see it immediately; signed-in first-run users finish the welcome
 * tour first so dialogs never stack.
 */
export function WhatsNewModal() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPending) return;
    let timer = 0;
    const unseen = !getStoredValue(STORAGE_KEY);
    const canIntroduce = !session || Boolean(getStoredValue(WELCOME_KEY));
    if (!presentedInThisRuntime && unseen && canIntroduce) {
      timer = window.setTimeout(() => {
        // Persist on presentation, not dismissal, so a reload while the modal
        // is open can never present the same announcement a second time.
        markAsPresented();
        setOpen(true);
      }, 650);
    }
    return () => window.clearTimeout(timer);
  }, [session, isPending]);

  const dismiss = () => {
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss();
      }}
    >
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="relative overflow-hidden border-b border-site-border px-5 py-7 pr-16 sm:px-9 sm:py-10 sm:pr-16">
          <div aria-hidden className="spatial-modal-art">
            <span />
          </div>
          <div className="relative z-1 max-w-md">
            <DialogTitle className="font-(family-name:--site-font-display) text-3xl font-medium leading-[0.98] tracking-[-0.045em] sm:text-5xl">
              {t('whatsnew-title-spatial', { defaultValue: 'Welcome to a quieter RMH.' })}
            </DialogTitle>
            <DialogDescription className="mt-4 max-w-sm text-sm leading-relaxed text-site-text-muted">
              {t('whatsnew-subtitle-spatial', {
                defaultValue: 'A simpler interface with more room for what matters.',
              })}
            </DialogDescription>
          </div>
        </div>

        <div className="grid grid-cols-1 px-4 py-3 sm:grid-cols-3 sm:gap-3 sm:px-9 sm:py-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.titleKey}
                className="grid min-w-0 grid-cols-[2.5rem_1fr] items-center gap-3 border-t border-site-border py-3 sm:flex sm:flex-col sm:items-start sm:pt-4"
              >
                <span className="flex size-10 items-center justify-center rounded-[var(--site-control-radius)] border border-site-border text-site-text">
                  <Icon className="size-4" aria-hidden />
                </span>
                <h3 className="text-xs font-semibold leading-tight text-site-text sm:text-sm">
                  {t(feature.titleKey, { defaultValue: feature.titleDefault })}
                </h3>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end border-t border-site-border px-4 py-4 sm:px-9 sm:py-5">
          <Button className="w-full sm:ml-auto sm:w-auto" onClick={dismiss}>
            {t('explore-new-ui', { defaultValue: 'Explore' })}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
