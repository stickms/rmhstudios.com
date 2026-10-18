/**
 * Massive March — signals left at a site (R18).
 *
 * Fixed phrases only, so a hint can say what its author saw without ever saying
 * anything else. Later players rate them; the best-rated read first.
 */

'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, MessageSquareQuote } from 'lucide-react';
import {
  SIGNAL_TEMPLATES,
  SIGNAL_TEMPLATE_IDS,
  type SignalTemplate,
  type SignalView,
} from '@/lib/massive-march/signals';
import { SYMBOLS, type SymbolId } from '@/lib/massive-march/world/sites';
import { Glyph } from '../Glyph';
import { MarchButton } from '../ui';

function usePhrase() {
  const { t } = useTranslation('f-async-games');
  return (template: SignalTemplate, param: string): string => {
    switch (template) {
      case 'look-again':
        return t('signal-look-again', { defaultValue: 'Go back and look again' });
      case 'listen':
        return t('signal-listen', { defaultValue: 'Listen to whoever can see it' });
      case 'wait-all':
        return t('signal-wait-all', { defaultValue: 'Wait until everyone is in place' });
      case 'order':
        return t('signal-order', { defaultValue: 'The order matters here' });
      case 'slow':
        return t('signal-slow', { defaultValue: 'Take it slowly' });
      case 'trust':
        return t('signal-trust', { defaultValue: 'Trust your partner' });
      case 'glyph-first':
        return t('signal-glyph-first', { defaultValue: 'Start with this glyph' });
      case 'glyph-avoid':
        return t('signal-glyph-avoid', { defaultValue: 'Not this glyph' });
      case 'count':
        return t('signal-count', { defaultValue: 'It is {{n}}', n: param });
    }
  };
}

export function SiteSignals({ siteId }: { siteId: string }) {
  const { t } = useTranslation('f-async-games');
  const phrase = usePhrase();
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<SignalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<SignalTemplate>('look-again');
  const [param, setParam] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/massive-march/signals?siteId=${encodeURIComponent(siteId)}`);
      if (!res.ok) throw new Error(String(res.status));
      setSignals(((await res.json()) as { signals: SignalView[] }).signals);
    } catch {
      setError(t('signals-load-error', { defaultValue: 'Signals did not load.' }));
    }
  }, [siteId, t]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && signals === null) void load();
  };

  const kind = SIGNAL_TEMPLATES[template];
  const effectiveParam = kind === 'none' ? '' : param || (kind === 'symbol' ? SYMBOLS[0] : '1');

  const vote = async (s: SignalView, value: -1 | 0 | 1) => {
    const res = await fetch('/api/massive-march/signals/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalId: s.id, value: s.myVote === value ? 0 : value }),
    });
    if (res.status === 401)
      return setError(t('signals-sign-in', { defaultValue: 'Sign in to rate signals.' }));
    if (res.ok) void load();
  };

  const leave = async () => {
    setError(null);
    const res = await fetch('/api/massive-march/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, template, param: effectiveParam }),
    });
    if (res.status === 401)
      return setError(t('signals-sign-in-leave', { defaultValue: 'Sign in to leave a signal.' }));
    if (res.status === 409)
      return setError(
        t('signals-limit', { defaultValue: 'You already left that one, or have left three here.' }),
      );
    if (!res.ok)
      return setError(t('signals-post-error', { defaultValue: 'Could not leave the signal.' }));
    void load();
  };

  return (
    <div className="border-t-2 border-current/20 pt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-xs font-bold tracking-wide uppercase"
      >
        <MessageSquareQuote aria-hidden className="size-3.5" />
        {t('signals-heading', { defaultValue: 'Signals left here' })}
        {open ? (
          <ChevronUp aria-hidden className="ms-auto size-3.5" />
        ) : (
          <ChevronDown aria-hidden className="ms-auto size-3.5" />
        )}
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          {signals === null ? (
            <p className="text-xs opacity-70">
              {t('signals-loading', { defaultValue: 'Looking…' })}
            </p>
          ) : signals.length === 0 ? (
            <p className="text-xs opacity-70">
              {t('signals-empty', { defaultValue: 'Nobody has left a signal here yet.' })}
            </p>
          ) : (
            <ul className="space-y-1">
              {signals.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="flex min-w-0 grow items-center gap-1.5">
                    {phrase(s.template, s.param)}
                    {SIGNAL_TEMPLATES[s.template] === 'symbol' ? (
                      <Glyph symbol={s.param as SymbolId} size={20} />
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-pressed={s.myVote === 1}
                    aria-label={t('signals-up', { defaultValue: 'Helpful' })}
                    disabled={s.mine}
                    onClick={() => void vote(s, 1)}
                    className={s.myVote === 1 ? 'font-black' : 'opacity-60'}
                  >
                    <ChevronUp aria-hidden className="size-4" />
                  </button>
                  <span className="w-5 text-center font-mono text-xs tabular-nums">{s.score}</span>
                  <button
                    type="button"
                    aria-pressed={s.myVote === -1}
                    aria-label={t('signals-down', { defaultValue: 'Misleading' })}
                    disabled={s.mine}
                    onClick={() => void vote(s, -1)}
                    className={s.myVote === -1 ? 'font-black' : 'opacity-60'}
                  >
                    <ChevronDown aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={template}
              aria-label={t('signals-phrase', { defaultValue: 'Signal phrase' })}
              onChange={(e) => {
                setTemplate(e.target.value as SignalTemplate);
                setParam('');
              }}
              className="min-w-0 grow border-2 bg-transparent px-1 py-1 text-sm"
            >
              {SIGNAL_TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {phrase(id, '…')}
                </option>
              ))}
            </select>
            {kind === 'symbol' ? (
              <div
                role="radiogroup"
                aria-label={t('signals-glyph', { defaultValue: 'Glyph' })}
                className="flex flex-wrap gap-1"
              >
                {SYMBOLS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={effectiveParam === g}
                    onClick={() => setParam(g)}
                    className={`border-2 p-0.5 ${effectiveParam === g ? 'border-current' : 'border-transparent opacity-60'}`}
                  >
                    <Glyph symbol={g} size={22} />
                  </button>
                ))}
              </div>
            ) : null}
            {kind === 'number' ? (
              <select
                value={effectiveParam}
                aria-label={t('signals-number', { defaultValue: 'Number' })}
                onChange={(e) => setParam(e.target.value)}
                className="border-2 bg-transparent px-1 py-1 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            ) : null}
            <MarchButton tone="primary" className="px-3 py-1 text-xs" onClick={() => void leave()}>
              {t('signals-leave', { defaultValue: 'Leave signal' })}
            </MarchButton>
          </div>
          {error ? (
            <p role="alert" className="text-xs">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
