'use client';

/**
 * Scheduled gifts (C7) — the wallet's "Gifts" tab. Lazy-loaded when the tab
 * opens: gifts waiting to be unwrapped, a form to send one, and gifts you have
 * scheduled.
 */
import { useRef, useState } from 'react';
import { m as motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gift, PackageOpen, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING } from '@/lib/motion';
import type {
  ReceivedGiftView,
  ScheduledGiftsPayload,
  SentGiftView,
} from '@/lib/gifting/scheduled-gift';
import { ApiError, apiJson, errorCode, newIdempotencyKey } from './api';
import { ItemPicker, type PickedItem } from './ItemPicker';

const KEY = ['economy-plus', 'scheduled-gifts'] as const;

export default function ScheduledGiftsPanel() {
  const { t } = useTranslation('f-economy-plus');
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<ScheduledGiftsPayload>('/api/gifts/scheduled'),
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-3 pb-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const waiting = data.received.filter((g) => !g.unwrapped);
  const opened = data.received.filter((g) => g.unwrapped);

  return (
    <div className="space-y-5 px-3 pb-8">
      <section aria-labelledby="gifts-for-you" className="space-y-3">
        <h2 id="gifts-for-you" className="site-section-label px-1">
          {t('gifts-for-you', { defaultValue: 'Gifts for you' })}
        </h2>
        {waiting.length === 0 && opened.length === 0 ? (
          <EmptyState
            icon={Gift}
            title={t('gifts-none-title', { defaultValue: 'Nothing waiting for you' })}
            description={t('gifts-none-desc', {
              defaultValue: 'When someone schedules a gift for you, it arrives here wrapped.',
            })}
          />
        ) : (
          <ul className="space-y-3">
            {waiting.map((g) => (
              <WrappedGift key={g.id} gift={g} />
            ))}
            {opened.map((g) => (
              <li key={g.id} className="glass-fill flex items-center gap-3 p-4">
                <PackageOpen className="size-5 shrink-0 text-site-text-dim" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{g.itemName}</p>
                  <p className="truncate text-xs text-site-text-muted">
                    {t('gifts-from', { defaultValue: 'From {{name}}', name: partyName(g.from) })}
                    {g.message ? ` · “${g.message}”` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SendGiftForm />

      <section aria-labelledby="gifts-sent" className="space-y-3">
        <h2 id="gifts-sent" className="site-section-label px-1">
          {t('gifts-sent', { defaultValue: 'Gifts you scheduled' })}
        </h2>
        {data.sent.length === 0 ? (
          <p className="px-1 text-sm text-site-text-muted">
            {t('gifts-sent-none', { defaultValue: 'You have not scheduled any gifts yet.' })}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.sent.map((g) => (
              <SentRow key={g.id} gift={g} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function partyName(p: { name: string | null; handle: string | null } | null): string {
  if (!p) return '—';
  return p.handle ? `@${p.handle}` : (p.name ?? '—');
}

function WrappedGift({ gift }: { gift: ReceivedGiftView }) {
  const { t } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState<{ itemName: string; message: string | null } | null>(
    null,
  );

  const unwrap = useMutation({
    mutationFn: () =>
      apiJson<{ itemName: string; message: string | null }>(
        `/api/gifts/scheduled/${encodeURIComponent(gift.id)}/unwrap`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      setRevealed(r);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t('gifts-unwrap-err', { defaultValue: "Couldn't open that gift" })),
  });

  if (revealed) {
    return (
      <motion.li
        initial={reduce ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.snappy}
        className="glass-pane space-y-1 p-5 text-center"
        aria-live="polite"
      >
        <PackageOpen className="mx-auto size-8 text-site-accent" aria-hidden />
        <p className="font-display text-xl font-medium text-site-text">{revealed.itemName}</p>
        <p className="text-sm text-site-text-muted">
          {t('gifts-from', { defaultValue: 'From {{name}}', name: partyName(gift.from) })}
        </p>
        {revealed.message ? <p className="text-sm text-site-text">“{revealed.message}”</p> : null}
        <p className="pt-1 text-xs text-site-text-muted">
          {t('gifts-added', { defaultValue: 'It is in your inventory — equip it from the shop.' })}
        </p>
      </motion.li>
    );
  }

  return (
    <li className="glass-pane flex items-center gap-4 p-4">
      <motion.div
        animate={reduce ? undefined : { rotate: [0, -4, 4, -3, 0] }}
        transition={{ duration: 1.2, repeat: 2, repeatDelay: 2.5 }}
        className="glass-fill flex size-14 shrink-0 items-center justify-center rounded-site"
        aria-hidden
      >
        <Gift className="size-7 text-site-accent" />
      </motion.div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-site-text">
          {t('gifts-wrapped', {
            defaultValue: 'A wrapped gift from {{name}}',
            name: partyName(gift.from),
          })}
        </p>
        <p className="text-xs text-site-text-muted">
          {t('gifts-wrapped-hint', { defaultValue: 'Open it to see what is inside.' })}
        </p>
      </div>
      <Button variant="accent" size="sm" loading={unwrap.isPending} onClick={() => unwrap.mutate()}>
        {t('gifts-unwrap', { defaultValue: 'Unwrap' })}
      </Button>
    </li>
  );
}

function SentRow({ gift }: { gift: SentGiftView }) {
  const { t, i18n } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(gift.deliverAt));
  const cancel = useMutation({
    mutationFn: () =>
      apiJson(`/api/gifts/scheduled/${encodeURIComponent(gift.id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('gifts-cancelled', { defaultValue: 'Gift cancelled — coins refunded' }));
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['economy-plus', 'balance'] });
    },
    onError: () => {
      toast.error(t('gifts-cancel-err', { defaultValue: "Couldn't cancel that gift" }));
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });

  const badge =
    gift.status === 'SCHEDULED' ? (
      <Badge variant="accent">{t('gifts-st-scheduled', { defaultValue: 'Scheduled' })}</Badge>
    ) : gift.status === 'DELIVERED' ? (
      <Badge variant="success">
        {gift.unwrapped
          ? t('gifts-st-opened', { defaultValue: 'Opened' })
          : t('gifts-st-delivered', { defaultValue: 'Delivered' })}
      </Badge>
    ) : (
      <Badge variant="default">
        {gift.status === 'CANCELLED'
          ? t('gifts-st-cancelled', { defaultValue: 'Cancelled' })
          : t('gifts-st-refunded', { defaultValue: 'Refunded' })}
      </Badge>
    );

  return (
    <li className="glass-fill flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-site-text">
          {gift.itemName} → {partyName(gift.recipient)}
        </p>
        <p className="flex items-center gap-1 text-xs text-site-text-muted">
          <CoinIcon className="size-3.5" /> {gift.price.toLocaleString()} · {when}
        </p>
      </div>
      {badge}
      {gift.status === 'SCHEDULED' ? (
        <Button
          variant="outline"
          size="sm"
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {t('gifts-cancel', { defaultValue: 'Cancel' })}
        </Button>
      ) : null}
    </li>
  );
}

function SendGiftForm() {
  const { t } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const [item, setItem] = useState<PickedItem | null>(null);
  const [recipient, setRecipient] = useState('');
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState('');
  const keyRef = useRef<string | null>(null);

  const send = useMutation({
    mutationFn: () => {
      keyRef.current ??= newIdempotencyKey();
      return apiJson('/api/gifts/scheduled', {
        method: 'POST',
        idempotencyKey: keyRef.current,
        body: {
          recipient: recipient.trim(),
          itemId: item?.id,
          deliverAt: new Date(when).toISOString(),
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      keyRef.current = null;
      toast.success(t('send-ok', { defaultValue: 'Gift scheduled' }));
      setItem(null);
      setRecipient('');
      setWhen('');
      setMessage('');
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['economy-plus', 'balance'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) keyRef.current = null;
      const code = errorCode(err);
      const msg: Record<string, string> = {
        INSUFFICIENT_COINS: t('send-err-coins', { defaultValue: 'Not enough coins' }),
        NO_SUCH_MEMBER: t('send-err-member', { defaultValue: 'We could not find that member.' }),
        SELF: t('send-err-self', { defaultValue: 'You cannot gift yourself.' }),
        BLOCKED: t('send-err-blocked', { defaultValue: 'You cannot send a gift to that member.' }),
        RECIPIENT_OWNS: t('send-err-owns', { defaultValue: 'They already own that item.' }),
        DUPLICATE: t('send-err-dup', { defaultValue: 'They already have that gift on the way.' }),
        BAD_DATE: t('send-err-date', {
          defaultValue: 'Pick a time at least 5 minutes from now, and within a year.',
        }),
        TOO_MANY: t('send-err-many', {
          defaultValue: 'You have too many gifts waiting to be delivered.',
        }),
        NOT_GIFTABLE: t('send-err-ungiftable', { defaultValue: 'That item cannot be gifted.' }),
      };
      toast.error(
        msg[code] ?? t('send-err-generic', { defaultValue: "Couldn't schedule that gift" }),
      );
    },
  });

  const whenValid = when !== '' && !Number.isNaN(new Date(when).getTime());
  const valid = item !== null && recipient.trim().length > 0 && whenValid;

  return (
    <section aria-labelledby="gifts-send" className="space-y-3">
      <h2 id="gifts-send" className="site-section-label px-1">
        {t('gifts-send', { defaultValue: 'Send a gift' })}
      </h2>
      <form
        className="glass-pane space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) send.mutate();
        }}
      >
        <ItemPicker
          mode="giftable"
          picked={item}
          onPick={setItem}
          label={t('send-pick-aria', { defaultValue: 'Search for an item to gift' })}
        />
        <Input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          maxLength={40}
          placeholder={t('send-recipient', { defaultValue: 'Their @handle' })}
          aria-label={t('send-recipient', { defaultValue: 'Their @handle' })}
          autoComplete="off"
        />
        <div className="space-y-1">
          <label htmlFor="gift-when" className="site-section-label block">
            {t('send-when', { defaultValue: 'Arrives on' })}
          </label>
          <Input
            id="gift-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 200))}
          rows={2}
          placeholder={t('send-message', { defaultValue: 'A note for the card (optional)' })}
          aria-label={t('send-message', { defaultValue: 'A note for the card (optional)' })}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-site-text-muted">
            {t('send-note', {
              defaultValue:
                'You pay now. If you cancel before it arrives, you are refunded in full.',
            })}
          </p>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={!valid}
            loading={send.isPending}
          >
            <Send />
            {item
              ? t('send-submit-price', {
                  defaultValue: 'Send for {{price}} coins',
                  price: item.price.toLocaleString(),
                })
              : t('send-submit', { defaultValue: 'Send gift' })}
          </Button>
        </div>
      </form>
    </section>
  );
}
