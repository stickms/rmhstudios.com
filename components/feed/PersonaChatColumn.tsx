/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useEffect, useRef, useState, useCallback } from'react';
import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import { Loader2, Bot, Send, ArrowLeft, Trash2 } from'lucide-react';
import { Button } from'@/components/ui/button';
import { EmptyState } from'@/components/ui/empty-state';
import { Spinner } from'@/components/ui/spinner';
import { useConfirm } from'@/components/ui/confirm-dialog';
import { liquidVTName } from'@/lib/view-transition';
import { AI_TIMEOUT_MS, api } from'@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { chatWithPersonaApi, deletePersonaApi, getPersonaApi } from'@/lib/personas/personas.contract';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { AdminModerateButton } from '@/components/moderation/moderation-ui';
import { NoGlobe } from '@/components/shell/NoGlobe';
import './conversation/conversation.css';

interface Msg {
 role: string;
 content: string;
}
interface Persona {
 id: string;
 name: string;
 tagline: string | null;
 greeting: string | null;
 emoji: string | null;
 avatarUrl?: string | null;
 chatCount: number;
 isOwner: boolean;
 owner: { name: string | null; handle: string | null };
}

export function PersonaChatColumn({
 id,
 initialData,
}: {
 id: string;
 /**
 * Persona (and conversation) prefetched by the route loader. `null`means the
 * loader determined not-found / private; `undefined`means unseeded (the
 * column falls back to its client fetch).
 */
 initialData?: { persona: Persona; messages: Msg[]; signedIn: boolean } | null;
}) {
 const { t } = useTranslation('feed');
 const refusalText = useRefusalText();
 const confirm = useConfirm();
 // Seed from the loader when it ran (even a `null`result is a definitive
 // not-found seed) so the column paints immediately without a mount fetch.
 const seeded = useRef(initialData !== undefined);
 const [persona, setPersona] = useState<Persona | null>(initialData?.persona ?? null);
 const [messages, setMessages] = useState<Msg[]>(initialData?.messages ?? []);
 const [signedIn, setSignedIn] = useState(!!initialData?.signedIn);
 const [loading, setLoading] = useState(initialData === undefined);
 const [notFound, setNotFound] = useState(initialData === null);
 const [input, setInput] = useState('');
 const [sending, setSending] = useState(false);
 const scrollRef = useRef<HTMLDivElement>(null);
 // Steel M9: a persona fetched here replaces the spinner; a reply replaces "typing…" and fades in.
 const arrival = useArrival(!loading);
 const isNewReply = useArrivingKeys(messages.map((_, i) => i));

 const load = useCallback(async () => {
 try {
 const data = await api(getPersonaApi, { params: { id } });
 setPersona(data.persona);
 setMessages(data.messages);
 setSignedIn(data.signedIn);
 } catch (e) {
 if (e instanceof HttpError && e.status === 404) setNotFound(true);
 }
 }, [id]);

 useEffect(() => {
 // When the loader already seeded the persona, skip the mount fetch.
 if (seeded.current) return;
 let active = true;
 (async () => {
 try {
 await load();
 } finally {
 if (active) setLoading(false);
 }
 })();
 return () => {
 active = false;
 };
 }, [load]);

 useEffect(() => {
 scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior:'smooth'});
 }, [messages, sending]);

 async function send() {
 const text = input.trim();
 if (!text || sending) return;
 setInput('');
 setMessages((m) => [...m, { role:'user', content: text }]);
 setSending(true);
 try {
 try {
 const data = await api(chatWithPersonaApi, {
 params: { id },
 body: { message: text },
 timeoutMs: AI_TIMEOUT_MS,
 });
 setMessages((m) => [...m, { role:'assistant', content: data.reply }]);
 } catch (e) {
 setMessages((m) => [
 ...m,
 {
 role:'assistant',
 content: `(${refusalText.maybe(e) ?? t('chat-error', { defaultValue:'Something went wrong'})})`,
 },
 ]);
 }
 } finally {
 setSending(false);
 }
 }

 async function del() {
 if (
 !(await confirm({
 title: t('delete-persona-confirm', { defaultValue:'Delete this persona?'}),
 danger: true,
 }))
 )
 return;
 try {
 await api(deletePersonaApi, { params: { id } });
 window.location.href ='/personas';
 } catch {
 // Not deleted: stay on the persona.
 }
 }

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (notFound || !persona) {
 return (
 <EmptyState
 className={arrival}
 title={t('persona-not-found', { defaultValue:'Persona not found'})}
 action={
 <Link to="/create/personas">
 <Button variant="default">
 {t('browse-personas', { defaultValue:'Browse personas'})}
 </Button>
 </Link>
 }
 />
 );
 }

 const greetingShown = messages.length === 0 && persona.greeting;

 // Laid out like a DM thread (ConversationView): `.conversation` is exactly as tall as the window leaves it, so the
 // message list is the one scroller and the composer is the bottom of the column. <NoGlobe /> takes the docked globe
 // off a phone, so the header's back link to /personas is the way out there (conversation.css, site-shell.css).
 return (
 <div className={cn('conversation', arrival)}>
 <NoGlobe />
 <div className="conversation__head">
 <Button asChild variant="ghost" size="icon" aria-label={t('back', { defaultValue: 'Back' })}>
 <Link to="/create/personas">
 <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
 </Link>
 </Button>
 {/* §5.48 liquid-open hero — the persona tile avatar morphs into this. */}
 <div
 className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-site-sm border border-site-border bg-site-bg-subtle text-lg"
 style={{ viewTransitionName: liquidVTName('persona', persona.id) }}
 >
 {persona.avatarUrl ? (
 <img src={persona.avatarUrl} alt="" className="h-full w-full object-cover" />
 ) : (
 persona.emoji || <Bot className="h-4 w-4 text-site-text-muted" aria-hidden />
 )}
 </div>
 <div className="min-w-0 flex-1">
 <h1 className="t-body truncate font-semibold text-site-text">{persona.name}</h1>
 {persona.tagline && (
 <p className="t-body truncate text-site-text-muted">{persona.tagline}</p>
 )}
 </div>
 {persona.isOwner && (
 <Button
 variant="ghost"
 size="icon"
 onClick={del}
 className="text-site-text-muted hover:text-site-danger"
 title={t('delete-persona', { defaultValue: 'Delete persona' })}
 aria-label={t('delete-persona', { defaultValue: 'Delete persona' })}
 >
 <Trash2 aria-hidden />
 </Button>
 )}
 {!persona.isOwner && (
 <AdminModerateButton
 entityType="persona"
 entityId={id}
 current={{ name: persona.name, tagline: persona.tagline }}
 onDone={(action) => {
 if (action === 'remove') window.location.assign('/personas');
 else window.location.reload();
 }}
 />
 )}
 </div>

 <div ref={scrollRef} className="conversation__thread flex flex-col gap-3 pt-3">
 {greetingShown && (
 <Bubble from="assistant" emoji={persona.emoji} avatarUrl={persona.avatarUrl}>
 {persona.greeting}
 </Bubble>
 )}
 {messages.map((m, i) => (
 <Bubble
 key={i}
 from={m.role}
 emoji={persona.emoji}
 avatarUrl={persona.avatarUrl}
 className={m.role === 'assistant' && isNewReply(i) ? ARRIVE : undefined}
 >
 {m.content}
 </Bubble>
 ))}
 {sending && (
 <Bubble from="assistant" emoji={persona.emoji} avatarUrl={persona.avatarUrl}>
 <span className="inline-flex items-center gap-1 text-site-text-muted">
 <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{' '}
 {t('typing', { defaultValue: 'typing…' })}
 </span>
 </Bubble>
 )}
 </div>

 <div className="conversation__composer">
 {signedIn ? (
 <div className="flex items-end gap-2">
 <textarea
 dir="auto"
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 send();
 }
 }}
 placeholder={t('message-placeholder', {
 name: persona.name,
 defaultValue: 'Message {{name}}…',
 })}
 aria-label={t('message-placeholder', {
 name: persona.name,
 defaultValue: 'Message {{name}}…',
 })}
 rows={1}
 maxLength={1000}
 className="max-h-32 min-w-0 flex-1 resize-none overflow-y-auto rounded-site surface-field px-3 py-2 text-sm text-site-text placeholder:text-site-text-muted"
 style={{ minHeight: '42px' }}
 />
 <Button
 variant="default"
 size="icon"
 disabled={!input.trim() || sending}
 onClick={send}
 className="h-[42px] w-[42px] shrink-0"
 aria-label={t('send', { defaultValue: 'Send' })}
 >
 <Send aria-hidden />
 </Button>
 </div>
 ) : (
 <p className="t-body py-2 text-center text-site-text-muted">
 <Link
 to="/login"
 search={{ callbackURL: `/personas/${id}` }}
 className="font-semibold text-site-text underline"
 >
 {t('sign-in', { defaultValue: 'Sign in' })}
 </Link>{' '}
 {t('sign-in-to-chat', { name: persona.name, defaultValue: 'to chat with {{name}}.' })}
 </p>
 )}
 </div>
 </div>
 );
}

/**
 * One message, styled like a DM row (conversation.css): yours is right aligned in an ink bubble, the persona's sits on
 * the page beside its avatar with no box (R3).
 */
function Bubble({
 from,
 emoji,
 avatarUrl,
 className,
 children,
}: {
 from: string;
 emoji: string | null;
 avatarUrl?: string | null;
 className?: string | undefined;
 children: React.ReactNode;
}) {
 if (from === 'user') {
 return (
 <div className={cn('conversation__mine', className)}>
 <div dir="auto" className="conversation__bubble t-post whitespace-pre-wrap">{children}</div>
 </div>
 );
 }
 return (
 <div className={cn('flex gap-2', className)}>
 <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-site-sm border border-site-border bg-site-bg-subtle text-sm">
 {avatarUrl ? (
 <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
 ) : (
 emoji || <Bot className="h-3.5 w-3.5 text-site-text-muted" aria-hidden />
 )}
 </div>
 <div dir="auto" className="conversation__theirs t-post min-w-0 whitespace-pre-wrap text-site-text">
 {children}
 </div>
 </div>
 );
}
