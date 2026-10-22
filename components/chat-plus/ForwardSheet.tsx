'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Forward, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import { forwardLabel, maxForwardTargets } from '@/lib/chat-plus/flags';
import type { ChatRef } from '@/lib/chat-plus/types';
import { useChatPlusUi, type ForwardTarget } from '@/lib/chat-plus/ui-store';

interface Destination {
  ref: ChatRef;
  name: string;
  image: string | null;
}

/** The chats a message can be forwarded to: recent DMs and every group. */
function useDestinations() {
  return useQuery({
    queryKey: ['chat-forward-destinations'],
    staleTime: 30_000,
    queryFn: async (): Promise<Destination[]> => {
      const [dms, groups] = await Promise.all([
        fetch('/api/messages', { credentials: 'include' }).then((r) =>
          r.ok ? r.json() : { conversations: [] },
        ),
        fetch('/api/group-chats', { credentials: 'include' }).then((r) =>
          r.ok ? r.json() : { groups: [] },
        ),
      ]);
      const out: Destination[] = [];
      // Saved Messages first: forwarding to yourself is the most common reason.
      const saved = await fetch('/api/messages/saved', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { saved: null }))
        .catch(() => ({ saved: null }));
      if (saved.saved) {
        out.push({
          ref: { kind: 'dm', id: saved.saved.conversationId },
          name: '\u0000saved',
          image: null,
        });
      }
      for (const c of dms.conversations ?? []) {
        out.push({
          ref: { kind: 'dm', id: c.id },
          name: c.otherUser?.name || c.otherUser?.username || '',
          image: c.otherUser?.image ?? null,
        });
      }
      for (const g of groups.groups ?? []) {
        out.push({ ref: { kind: 'group', id: g.id }, name: g.name, image: null });
      }
      return out;
    },
  });
}

export default function ForwardSheet({ target }: { target: ForwardTarget }) {
  const { t } = useTranslation('f-messaging');
  const close = useChatPlusUi((s) => s.close);
  const { data, isLoading } = useDestinations();
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const limit = maxForwardTargets(target.forwardCount);
  const many = forwardLabel(target.forwardCount) === 'many';
  const key = (r: ChatRef) => `${r.kind}:${r.id}`;
  const byKey = useMemo(() => new Map((data ?? []).map((d) => [key(d.ref), d])), [data]);

  const toggle = (k: string) =>
    setPicked((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      // At the limit, a new pick replaces the previous one when the limit is 1,
      // otherwise it is ignored (the counter says why).
      if (limit === 1) return [k];
      return prev.length >= limit ? prev : [...prev, k];
    });

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/chats/forward', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: target.source,
          messageId: target.messageId,
          targets: picked.map((k) => byKey.get(k)!.ref),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          body.error || t('forward-failed', { defaultValue: 'Could not forward that message' }),
        );
        return;
      }
      const failed = (body.failed ?? []).length;
      if (failed > 0) {
        toast.warning(
          t('forward-partial', {
            failed,
            defaultValue: 'Forwarded, but {{failed}} chat(s) could not receive it',
          }),
        );
      } else {
        toast.success(t('forward-sent', { defaultValue: 'Forwarded' }));
      }
      close();
    } catch {
      toast.error(t('forward-failed', { defaultValue: 'Could not forward that message' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Forward className="size-4" aria-hidden />
            {t('forward-title', { defaultValue: 'Forward message' })}
          </SheetTitle>
          <SheetDescription>
            {many
              ? t('forward-many-note', {
                  defaultValue:
                    'This message has been forwarded many times, so it can only go to one chat at a time.',
                })
              : t('forward-note', { max: limit, defaultValue: 'Choose up to {{max}} chats.' })}
          </SheetDescription>
        </SheetHeader>
        {target.preview && (
          <p className="glass-inset line-clamp-2 rounded-site-sm px-3 py-2 text-sm text-site-text-muted">
            {target.preview}
          </p>
        )}
        <div
          className="max-h-[45vh] overflow-y-auto"
          role="group"
          aria-label={t('forward-chats', { defaultValue: 'Chats' })}
        >
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : (data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-site-text-dim">
              {t('forward-empty', { defaultValue: 'You have no chats to forward to yet.' })}
            </p>
          ) : (
            <ul className="flex flex-col">
              {(data ?? []).map((d) => {
                const k = key(d.ref);
                const on = picked.includes(k);
                return (
                  <li key={k}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(k)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-site-sm px-2 py-1.5 text-left hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent',
                        on && 'bg-site-accent-dim',
                      )}
                    >
                      {d.ref.kind === 'group' ? (
                        <span className="flex size-9 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
                          <Users className="size-4" aria-hidden />
                        </span>
                      ) : (
                        <UserAvatar
                          src={d.image ?? undefined}
                          alt=""
                          size={36}
                          fallbackName={d.name || undefined}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">
                        {d.name === '\u0000saved'
                          ? t('saved-messages', { defaultValue: 'Saved Messages' })
                          : d.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Button
          variant="accent"
          disabled={picked.length === 0 || sending}
          loading={sending}
          onClick={() => void send()}
        >
          {t('forward-send', { count: picked.length, defaultValue: 'Send to {{count}} chat(s)' })}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
