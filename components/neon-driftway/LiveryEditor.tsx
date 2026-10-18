'use client';

/** Livery editor: base colour, two accents, a stripe pattern; saved per member, shared as a code. */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useSession } from '@/components/Providers';
import {
  decodeLivery,
  drawLivery,
  encodeLivery,
  getLivery,
  setLivery,
  STRIPES,
  type Livery,
  type Stripe,
} from '@/lib/neon-driftway/livery';

async function saveRemote(l: Livery): Promise<boolean> {
  try {
    const res = await fetch('/api/neon-driftway/livery', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: encodeLivery(l) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function Preview({ livery }: { livery: Livery }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawLivery(ctx, 160, livery);
  }, [livery]);
  return <canvas ref={ref} width={160} height={160} className="size-32 rounded-site" aria-hidden />;
}

export function LiveryEditorButton() {
  const { t } = useTranslation('f-action');
  const session = useSession();
  const [l, setL] = useState<Livery>(() => getLivery());
  const [code, setCode] = useState('');

  // A saved livery follows the member to a new browser.
  useEffect(() => {
    if (!session.data) return;
    let cancelled = false;
    fetch('/api/neon-driftway/livery')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { code: string | null } | null) => {
        const remote = data?.code ? decodeLivery(data.code) : null;
        if (remote && !cancelled) {
          setLivery(remote);
          setL(remote);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.data]);

  const update = (patch: Partial<Livery>) => {
    const next = { ...l, ...patch };
    setL(next);
    setLivery(next);
  };
  const persist = async () => {
    const ok = await saveRemote(l);
    if (ok) toast.success(t('ndw-livery-saved', { defaultValue: 'Livery saved to your account' }));
    else toast.error(t('ndw-livery-save-failed', { defaultValue: 'Could not save the livery' }));
  };
  const color = (label: string, key: 'base' | 'accent1' | 'accent2') => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="color"
        value={`#${l[key]}`}
        onChange={(e) => update({ [key]: e.target.value.slice(1) })}
        className="h-8 w-16 cursor-pointer rounded-site bg-transparent"
      />
    </label>
  );
  const stripeLabel: Record<Stripe, string> = {
    none: t('ndw-stripe-none', { defaultValue: 'Plain' }),
    center: t('ndw-stripe-center', { defaultValue: 'Centre' }),
    twin: t('ndw-stripe-twin', { defaultValue: 'Twin' }),
    chevron: t('ndw-stripe-chevron', { defaultValue: 'Chevron' }),
    side: t('ndw-stripe-side', { defaultValue: 'Side' }),
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Palette aria-hidden /> {t('ndw-livery-open', { defaultValue: 'Livery' })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ndw-livery-title', { defaultValue: 'Livery editor' })}</DialogTitle>
          <DialogDescription>
            {t('ndw-livery-desc', {
              defaultValue:
                'Paints your own bonnet and wheel hub. Other drivers in multiplayer do not see it: the car update that is sent between players carries no paint.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <Preview livery={l} />
          </div>
          {color(t('ndw-livery-base', { defaultValue: 'Base colour' }), 'base')}
          {color(t('ndw-livery-accent1', { defaultValue: 'Accent 1' }), 'accent1')}
          {color(t('ndw-livery-accent2', { defaultValue: 'Accent 2' }), 'accent2')}
          <LiquidTabs
            aria-label={t('ndw-livery-stripe', { defaultValue: 'Stripe' })}
            value={l.stripe}
            onChange={(id) => update({ stripe: id as Stripe })}
            size="sm"
            tabs={STRIPES.map((s) => ({ id: s, label: stripeLabel[s] }))}
          />
          <div className="flex items-center gap-2">
            <code className="glass-inset flex-1 truncate rounded-site px-2 py-1.5 text-xs">
              {encodeLivery(l)}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(encodeLivery(l)).then(
                  () => toast.success(t('ndw-livery-copied', { defaultValue: 'Code copied' })),
                  () =>
                    toast.error(
                      t('ndw-livery-copy-failed', { defaultValue: 'Could not copy the code' }),
                    ),
                );
              }}
            >
              <Copy aria-hidden /> {t('ndw-livery-copy', { defaultValue: 'Copy' })}
            </Button>
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = decodeLivery(code);
              if (!parsed) {
                toast.error(
                  t('ndw-livery-bad-code', { defaultValue: 'That is not a valid livery code' }),
                );
                return;
              }
              setL(parsed);
              setLivery(parsed);
              setCode('');
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ND1-00c8ff-ffffff-ff3366-0"
              aria-label={t('ndw-livery-import-label', { defaultValue: 'Livery code to import' })}
            />
            <Button type="submit" size="sm" disabled={!code.trim()}>
              {t('ndw-livery-import', { defaultValue: 'Import' })}
            </Button>
          </form>
          <Button className="w-full" onClick={() => void persist()} disabled={!session.data}>
            {t('ndw-livery-save', { defaultValue: 'Save to my account' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
