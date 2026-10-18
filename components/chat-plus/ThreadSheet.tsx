'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
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
import { UserAvatar } from '@/components/feed/UserAvatar';
import { useChatPlusUi, type ThreadTarget } from '@/lib/chat-plus/ui-store';
import type { ThreadReply } from '@/lib/chat-plus/types';
import { useChatUpdates } from './hooks';

interface ThreadMessage extends ThreadReply {
  imageUrls?: string[];
  gifUrl?: string | null;
}

/** The side-thread panel for a group message (M7). */
export default function ThreadSheet({
  target,
  viewerId,
}: {
  target: ThreadTarget;
  viewerId: string;
}) {
  const { t } = useTranslation('f-messaging');
  const close = useChatPlusUi((s) => s.close);
  const [parent, setParent] = useState<ThreadMessage | null>(null);
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const base = `/api/chats/group/${encodeURIComponent(target.groupId)}/thread/${encodeURIComponent(target.parentId)}`;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(base, { credentials: 'include' });
        if (!active) return;
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const data = (await res.json()) as { parent: ThreadMessage; replies: ThreadMessage[] };
        setParent(data.parent);
        setReplies(data.replies);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [base]);

  // Replies from other members arrive on the group's existing channel.
  useChatUpdates({ kind: 'group', id: target.groupId }, (u) => {
    if (u.op === 'thread' && u.parentId === target.parentId && u.reply) {
      const reply = u.reply;
      setReplies((prev) => (prev.some((r) => r.id === reply.id) ? prev : [...prev, reply]));
    }
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [replies.length, loading]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(base, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('reply failed');
      const data = (await res.json()) as { reply: ThreadMessage };
      setReplies((prev) =>
        prev.some((r) => r.id === data.reply.id) ? prev : [...prev, data.reply],
      );
      setDraft('');
    } catch {
      toast.error(t('thread-reply-failed', { defaultValue: 'Could not send your reply' }));
    } finally {
      setSending(false);
    }
  }, [base, draft, sending, t]);

  const row = (m: ThreadMessage, emphasised = false) => (
    <li key={m.id} className="flex gap-2.5 py-2">
      <UserAvatar user={m.sender} size="sm" linkToProfile={false} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-site-text-dim">
          <span className="font-medium text-site-text">
            {m.sender.id === viewerId
              ? t('you', { defaultValue: 'You' })
              : m.sender.name || m.sender.handle || t('member', { defaultValue: 'Member' })}
          </span>
        </p>
        <p
          className={`whitespace-pre-wrap break-words text-sm ${emphasised ? 'text-site-text' : 'text-site-text-muted'}`}
        >
          {m.content}
        </p>
      </div>
    </li>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('thread-title', { defaultValue: 'Thread' })}</SheetTitle>
          <SheetDescription>
            {t('thread-description', { defaultValue: 'Replies here stay out of the main chat.' })}
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : missing || !parent ? (
            <p className="py-8 text-center text-sm text-site-text-dim">
              {t('thread-missing', { defaultValue: 'This thread is no longer available.' })}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-site-border">{row(parent, true)}</ul>
              <p className="mt-2 text-xs text-site-text-dim">
                {t('thread-reply-count', {
                  count: replies.length,
                  defaultValue: '{{count}} replies',
                })}
              </p>
              <ul className="divide-y divide-site-border">{replies.map((r) => row(r))}</ul>
              <div ref={endRef} />
            </>
          )}
        </div>
        {!missing && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="thread-reply">
              {t('thread-reply-label', { defaultValue: 'Reply in thread' })}
            </label>
            <textarea
              id="thread-reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={t('thread-reply-placeholder', { defaultValue: 'Reply in thread…' })}
              className="glass-inset max-h-28 min-h-11 flex-1 resize-none rounded-site px-3 py-2.5 text-sm text-site-text outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
            />
            <Button
              type="submit"
              variant="accent"
              size="icon"
              disabled={!draft.trim() || sending}
              aria-label={t('thread-send', { defaultValue: 'Send reply' })}
            >
              <Send className="size-4" />
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
