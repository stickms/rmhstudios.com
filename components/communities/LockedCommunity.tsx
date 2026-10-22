'use client';

/**
 * Private communities are "listed + locked": anyone can see that one exists and
 * read its metadata, nobody but members sees its content. These are the shared
 * pieces — the locked card/preview, the "Request to join" control and the
 * "Join with invite" control — used by the directory, `/c/$slug` and the invite
 * page.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/components/Providers';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { cn } from '@/lib/utils';

export interface LockedCommunityMeta {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
}

/** The lock badge: the one place "private" is spelled, so every surface says it the same way. */
export function LockBadge({ className }: { className?: string }) {
  const { t } = useTranslation('f-communities-plus');
  return (
    <Badge variant="outline" className={className}>
      <Lock aria-hidden />
      {t('locked-badge', { defaultValue: 'Private' })}
    </Badge>
  );
}

/** Icon tile + name + lock badge + description + member count — metadata only. */
export function LockedCommunityHeader({
  community,
  as: Heading = 'h2',
}: {
  community: LockedCommunityMeta;
  as?: 'h1' | 'h2' | 'p';
}) {
  const { t } = useTranslation('f-communities-plus');
  return (
    <div className="flex items-start gap-4">
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-site text-3xl"
        style={{ background: (community.color || 'var(--site-accent)') + '22' }}
        aria-hidden
      >
        {community.icon || '👥'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="truncate text-base font-bold text-site-text">
            {community.name}
          </Heading>
          <LockBadge />
        </div>
        {community.description && (
          <p className="mt-0.5 line-clamp-3 text-sm text-site-text-muted">
            {community.description}
          </p>
        )}
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-text-dim">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {t('locked-members', {
            count: community.memberCount,
            defaultValue_one: '{{count}} member',
            defaultValue: '{{count}} members',
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * The locked preview shown to a non-member: the metadata, why the rest is
 * hidden, and the way in.
 */
export function LockedCommunityPreview({
  community,
  requestState,
  children,
}: {
  community: LockedCommunityMeta;
  requestState: 'PENDING' | 'DENIED' | null;
  /** Extra actions (the invite page puts "Join" here). */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('f-communities-plus');
  return (
    <div className="glass-pane mx-auto flex max-w-xl flex-col gap-5 p-5">
      <LockedCommunityHeader community={community} as="h1" />
      <p className="text-sm text-site-text-muted">
        {t('locked-explainer', {
          defaultValue:
            'This is a private community. Its posts, members and events are only visible to members.',
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {/* Beside a primary action (the invite page's "Join") asking is the
            quieter second choice: same height, outline instead of accent. */}
        <RequestToJoin
          slug={community.slug}
          initialState={requestState}
          size={children ? 'default' : 'sm'}
          variant={children ? 'outline' : 'accent'}
        />
      </div>
    </div>
  );
}

/**
 * "Request to join" for a locked community: optional message, then a pending
 * state with a way to withdraw. A member never gets this control (callers only
 * render it for locked communities).
 */
export function RequestToJoin({
  slug,
  initialState,
  size = 'sm',
  variant = 'accent',
  className,
}: {
  slug: string;
  initialState: 'PENDING' | 'DENIED' | null;
  size?: 'sm' | 'default';
  variant?: 'accent' | 'outline';
  className?: string;
}) {
  const { t } = useTranslation('f-communities-plus');
  const { data: session } = useSession();
  const [state, setState] = useState<'PENDING' | 'DENIED' | null>(initialState);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Sending swaps the "Request to join" button (and its dialog) for the pending
  // state, which would drop focus to <body>; hand it to the control that replaced it.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sentHere = useRef(false);
  useEffect(() => {
    if (state === 'PENDING' && sentHere.current) {
      sentHere.current = false;
      cancelRef.current?.focus();
    }
  }, [state]);

  if (!session) {
    return (
      <Button asChild size={size} variant={variant} className={className}>
        <Link to="/login" search={{ callbackURL: `/c/${slug}` }}>
          {t('request-signin', { defaultValue: 'Sign in to request to join' })}
        </Link>
      </Button>
    );
  }

  const send = async () => {
    setBusy(true);
    const res = await plusFetch<{ status: 'PENDING' }>(
      communityApi(slug, '/join-request'),
      'POST',
      {
        message: message.trim() || undefined,
      },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(
        res.status === 429
          ? t('request-cooldown', { defaultValue: 'You can ask again in a few days.' })
          : res.error || t('request-error', { defaultValue: "Couldn't send your request" }),
      );
      setOpen(false);
      return;
    }
    sentHere.current = true;
    setState('PENDING');
    setOpen(false);
    setMessage('');
    toast.success(
      t('request-sent-toast', { defaultValue: 'Request sent. A moderator will review it.' }),
    );
  };

  const cancel = async () => {
    setBusy(true);
    const res = await plusFetch(communityApi(slug, '/join-request'), 'DELETE');
    setBusy(false);
    if (res.ok) setState(null);
    else toast.error(t('request-cancel-error', { defaultValue: "Couldn't cancel your request" }));
  };

  if (state === 'PENDING') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)} role="status">
        <span className="text-sm font-medium text-site-text-muted">
          {t('request-pending', { defaultValue: 'Request sent' })}
        </span>
        <Button ref={cancelRef} size={size} variant="ghost" onClick={cancel} disabled={busy}>
          {t('request-cancel', { defaultValue: 'Cancel request' })}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {state === 'DENIED' && (
          <span className="text-xs text-site-text-muted">
            {t('request-denied', { defaultValue: "Your last request wasn't approved." })}
          </span>
        )}
        {/* A real DialogTrigger so Radix returns focus to it when the dialog closes. */}
        <DialogTrigger asChild>
          <Button size={size} variant={variant}>
            {t('request-button', { defaultValue: 'Request to join' })}
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('request-title', { defaultValue: 'Request to join' })}</DialogTitle>
          <DialogDescription>
            {t('request-description', {
              defaultValue: 'The owner or a moderator will review your request.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`join-msg-${slug}`}>
            {t('request-message-label', { defaultValue: 'Message (optional)' })}
          </Label>
          <Textarea
            id={`join-msg-${slug}`}
            value={message}
            maxLength={280}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('request-message-placeholder', {
              defaultValue: 'Say why you would like to join',
            })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {t('request-dialog-cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="accent" onClick={send} disabled={busy}>
            {t('request-send', { defaultValue: 'Send request' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
