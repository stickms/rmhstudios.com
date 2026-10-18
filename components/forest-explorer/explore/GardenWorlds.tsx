'use client';

import { useEffect, useState } from 'react';
import { Droplets, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PostcardBox } from '@/components/worlds/PostcardBox';
import { ShareWorldDialog } from '@/components/worlds/ShareWorldDialog';
import { useVisitedWorld } from '@/components/worlds/useWorld';
import type { GardenPlant } from '@/lib/forest-explorer/garden';
import { useGardenStore } from '@/lib/forest-explorer/gardenStore';
import { codeFromLocation } from '@/lib/worlds/schema';

/**
 * R7, the headless half: mounted once for the whole session. Opens a friend's
 * published garden (?garden=CODE) read-only, or, in your own garden, collects
 * the waterings friends gave it since your last visit.
 */
export function GardenWorldsLoader() {
  const { t } = useTranslation('f-worlds');
  const code = useState(() => codeFromLocation('garden'))[0];
  const { world } = useVisitedWorld(code);

  useEffect(() => {
    if (code) return;
    const store = useGardenStore.getState();
    store.init();
    void fetch('/api/worlds/garden-claim', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then(({ count }: { count: number }) => {
        if (!count) return;
        useGardenStore.getState().applyWaterings(count);
        toast.success(
          t('garden-bonus', {
            defaultValue:
              '{{count}} friend watered your garden - your plants grew a little faster.',
            count,
          }),
        );
      })
      .catch(() => {});
  }, [code, t]);

  useEffect(() => {
    if (world?.kind === 'garden') {
      const plants = (world.payload as { plants?: GardenPlant[] }).plants ?? [];
      useGardenStore.getState().enterVisit(plants, { code: world.code, title: world.title });
    }
  }, [world]);

  return null;
}

/** R7, the pause-card half: share your garden, or water / write to the one you are visiting. */
export function GardenWorldsCard() {
  const { t } = useTranslation('f-worlds');
  const visiting = useGardenStore((s) => s.visiting);
  const [shareOpen, setShareOpen] = useState(false);
  const { world, reload } = useVisitedWorld(visiting?.code ?? null);

  async function water() {
    if (!visiting) return;
    const res = await fetch(`/api/worlds/visit/${visiting.code}/water`, { method: 'POST' });
    if (res.ok)
      toast.success(
        t('garden-watered', { defaultValue: 'You watered the garden. They will get a note.' }),
      );
    else if (res.status === 401)
      toast.error(t('garden-signin', { defaultValue: 'Sign in to water a garden.' }));
    else if (res.status === 409)
      toast.message(
        t('garden-already', { defaultValue: 'You already watered this garden today.' }),
      );
    else toast.error(t('garden-failed', { defaultValue: 'Could not water the garden.' }));
    void reload();
  }

  const btn =
    'w-full py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer bg-white/10 text-zinc-200 hover:bg-white/15 flex items-center justify-center gap-2';

  if (visiting) {
    return (
      <div className="space-y-2 text-left">
        <p className="text-sm text-green-200 text-center">
          {t('garden-visiting', { defaultValue: 'Visiting {{name}}', name: visiting.title })}
        </p>
        <button className={btn} disabled={world?.wateredToday} onClick={water}>
          <Droplets className="size-4" aria-hidden />
          {world?.wateredToday
            ? t('garden-watered-today', { defaultValue: 'Watered today' })
            : t('garden-water', { defaultValue: 'Water garden' })}
        </button>
        {world && <PostcardBox world={world} onSent={reload} />}
        <a className={btn} href="/forest-explorer/explore">
          {t('garden-home', { defaultValue: 'Back to my garden' })}
        </a>
      </div>
    );
  }

  return (
    <>
      <button className={btn} onClick={() => setShareOpen(true)}>
        <Share2 className="size-4" aria-hidden />
        {t('garden-share', { defaultValue: 'Share my garden' })}
      </button>
      {shareOpen && (
        <ShareWorldDialog
          kind="garden"
          open={shareOpen}
          onOpenChange={setShareOpen}
          title={t('garden-share-title', { defaultValue: 'Share your garden' })}
          getPayload={() => ({ plants: useGardenStore.getState().plants })}
        />
      )}
    </>
  );
}
