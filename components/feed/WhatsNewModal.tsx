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
    number: '01',
    titleKey: 'spatial-feature-space-title',
    titleDefault: 'More space. Less chrome.',
    bodyKey: 'spatial-feature-space-body',
    bodyDefault: 'Pages now lead with the work, using clear hierarchy and room to breathe.',
  },
  {
    icon: Grid2X2,
    number: '02',
    titleKey: 'spatial-feature-system-title',
    titleDefault: 'One visual language.',
    bodyKey: 'spatial-feature-system-body',
    bodyDefault: 'Navigation, cards, search, and controls now share one quiet monochrome system.',
  },
  {
    icon: Move3D,
    number: '03',
    titleKey: 'spatial-feature-motion-title',
    titleDefault: 'Motion with purpose.',
    bodyKey: 'spatial-feature-motion-body',
    bodyDefault:
      'Subtle parallax and transitions add depth while respecting reduced-motion settings.',
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
        <div className="relative overflow-hidden border-b border-site-border px-6 py-8 sm:px-9 sm:py-10">
          <div aria-hidden className="spatial-modal-art">
            <span />
          </div>
          <div className="relative z-1 max-w-md">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-site-text-dim">
              {t('whatsnew-kicker', { defaultValue: "What's new / 01" })}
            </p>
            <DialogTitle className="font-(family-name:--site-font-display) text-4xl font-medium leading-[0.98] tracking-[-0.045em] sm:text-5xl">
              {t('whatsnew-title-spatial', { defaultValue: 'Welcome to a quieter RMH.' })}
            </DialogTitle>
            <DialogDescription className="mt-4 max-w-sm text-sm leading-relaxed text-site-text-muted">
              {t('whatsnew-subtitle-spatial', {
                defaultValue:
                  'The entire interface has been rebuilt around spatial minimalism: simple color, sharper hierarchy, and fewer distractions.',
              })}
            </DialogDescription>
          </div>
        </div>

        <div className="divide-y divide-site-border px-6 sm:px-9">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.number}
                className="grid grid-cols-[2rem_1fr] gap-4 py-5 sm:grid-cols-[2rem_2.5rem_1fr]"
              >
                <span className="pt-1 text-[10px] font-semibold tracking-[0.2em] text-site-text-dim">
                  {feature.number}
                </span>
                <span className="hidden size-10 items-center justify-center rounded-full border border-site-border sm:flex">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-site-text">
                    {t(feature.titleKey, { defaultValue: feature.titleDefault })}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-site-text-muted sm:text-sm">
                    {t(feature.bodyKey, { defaultValue: feature.bodyDefault })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-site-border px-6 py-5 sm:px-9">
          <p className="hidden text-xs text-site-text-dim sm:block">
            {t('whatsnew-version', { defaultValue: 'Spatial system / July 2026' })}
          </p>
          <Button className="ml-auto" onClick={dismiss}>
            {t('explore-new-ui', { defaultValue: 'Explore the new UI' })}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
