'use client';

/**
 * Velum2099 contract board (R12). The game is plain DOM; this React layer talks
 * to it over window events: `velum2099:sim` (a drive started/stopped),
 * `velum2099:delivered` (a courier leg finished), `velum2099:contract-failed`,
 * and `velum2099:take-contract` (sent back to the game).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { legLength, type ContractRoute, type ContractView } from '@/lib/velum2099/contracts';

interface Delivered extends ContractRoute {
  seconds: number;
  contract: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export function ContractDock() {
  const { t } = useTranslation('f-async-games');
  const [sim, setSim] = useState(false);
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<ContractView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const submit = useCallback(
    async (run: Delivered) => {
      try {
        const res = await fetch('/api/velum2099/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickupX: run.pickupX,
            pickupZ: run.pickupZ,
            dropX: run.dropX,
            dropZ: run.dropZ,
            seconds: Math.round(run.seconds * 100) / 100,
          }),
        });
        if (res.status === 401) {
          toast(t('contract-sign-in', { defaultValue: 'Sign in to post contract times.' }));
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          result: 'posted' | 'record' | 'slower';
          previousSeconds?: number;
        };
        if (body.result === 'posted') {
          toast.success(
            t('contract-posted', {
              defaultValue: 'Contract posted at {{time}}.',
              time: fmt(run.seconds),
            }),
          );
        } else if (body.result === 'record') {
          toast.success(
            t('contract-record', {
              defaultValue: 'New record: {{time}}. The route is yours.',
              time: fmt(run.seconds),
            }),
          );
        } else {
          toast(
            t('contract-slower', {
              defaultValue: '{{time}} — the record is {{best}}.',
              time: fmt(run.seconds),
              best: fmt(body.previousSeconds ?? 0),
            }),
          );
        }
        setBoard(null);
      } catch {
        toast.error(t('contract-error', { defaultValue: 'Could not reach the contract board.' }));
      }
    },
    [t],
  );

  useEffect(() => {
    const onSim = (e: Event) => {
      const on = Boolean((e as CustomEvent<{ active: boolean }>).detail?.active);
      setSim(on);
      if (!on) {
        setActive(null);
        setOpen(false);
      }
    };
    const onDelivered = (e: Event) => {
      const run = (e as CustomEvent<Delivered>).detail;
      setActive(null);
      if (run.contract) {
        void submit(run);
        return;
      }
      toast(
        t('contract-delivered', { defaultValue: 'Delivered in {{time}}.', time: fmt(run.seconds) }),
        {
          action: {
            label: t('contract-post', { defaultValue: 'Post as contract' }),
            onClick: () => void submit(run),
          },
          duration: 12_000,
        },
      );
    };
    const onFailed = () => {
      setActive(null);
      toast.error(t('contract-failed', { defaultValue: 'Contract failed — the clock ran out.' }));
    };
    window.addEventListener('velum2099:sim', onSim);
    window.addEventListener('velum2099:delivered', onDelivered);
    window.addEventListener('velum2099:contract-failed', onFailed);
    return () => {
      window.removeEventListener('velum2099:sim', onSim);
      window.removeEventListener('velum2099:delivered', onDelivered);
      window.removeEventListener('velum2099:contract-failed', onFailed);
    };
  }, [submit, t]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    fetch('/api/velum2099/contracts')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { contracts: ContractView[] }) => live && setBoard(b.contracts))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open]);

  if (!sim) return null;

  const take = (c: ContractView) => {
    window.dispatchEvent(
      new CustomEvent('velum2099:take-contract', {
        detail: {
          id: c.id,
          pickup: { x: c.pickupX, z: c.pickupZ },
          drop: { x: c.dropX, z: c.dropZ },
        },
      }),
    );
    setActive(c.id);
    setOpen(false);
  };

  return (
    <>
      <Button
        data-floating="feature-overlay"
        variant="secondary"
        size="sm"
        className="glass-overlay fixed end-3 bottom-24 z-30"
        onClick={() => setOpen(true)}
      >
        <ScrollText aria-hidden />
        {active
          ? t('contract-dock-active', { defaultValue: 'Contract running' })
          : t('contract-dock', { defaultValue: 'Contracts' })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contract-board', { defaultValue: 'Contract board' })}</DialogTitle>
            <DialogDescription>
              {t('contract-board-help', {
                defaultValue:
                  'Routes other couriers posted. Take one, beat the record, and the route is credited to you. Finish any plain courier run to post your own.',
              })}
            </DialogDescription>
          </DialogHeader>
          {failed ? (
            <p className="text-sm text-site-danger">
              {t('contract-load-error', { defaultValue: 'The board did not load.' })}
            </p>
          ) : board === null ? (
            <p className="text-sm text-site-text-muted">
              {t('contract-loading', { defaultValue: 'Loading…' })}
            </p>
          ) : board.length === 0 ? (
            <p className="text-sm text-site-text-muted">
              {t('contract-empty', {
                defaultValue: 'No contracts yet. Deliver a package and post the first.',
              })}
            </p>
          ) : (
            <ul className="max-h-[50dvh] space-y-2 overflow-y-auto">
              {board.map((c) => (
                <li key={c.id} className="glass-fill flex items-center gap-3 rounded-site p-3">
                  <div className="min-w-0 grow">
                    <p className="font-mono text-sm font-bold text-site-text">
                      {fmt(c.bestSeconds)}
                    </p>
                    <p className="truncate text-xs text-site-text-muted">
                      {t('contract-leg', {
                        defaultValue: '{{metres}} m leg',
                        metres: Math.round(legLength(c)),
                      })}
                      {' · '}
                      {c.mine
                        ? t('contract-held-you', { defaultValue: 'held by you' })
                        : t('contract-held-by', {
                            defaultValue: 'held by {{name}}',
                            name:
                              c.holder?.username ??
                              c.holder?.name ??
                              t('contract-unknown', { defaultValue: 'a courier' }),
                          })}
                      {' · '}
                      {t('contract-runs', {
                        defaultValue_one: '{{count}} run',
                        defaultValue: '{{count}} runs',
                        count: c.runs,
                      })}
                    </p>
                  </div>
                  <Button size="sm" variant="accent" onClick={() => take(c)}>
                    {t('contract-take', { defaultValue: 'Take it' })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
