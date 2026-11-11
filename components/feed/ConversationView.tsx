import { useCallback, useMemo, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSession, useResolvedUser } from '@/components/Providers';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ChatPlusHost } from '@/components/chat-plus/ChatPlusHost';
import {
  useChatMeta,
  useChatTheme,
  useChatUpdates,
  useExpiring,
} from '@/components/chat-plus/hooks';
import { applyChatUpdate } from '@/lib/chat-plus/apply-update';
import { ConversationHeader } from './conversation/ConversationHeader';
import { MessageRow } from './conversation/MessageRow';
import { TypingBubble } from './conversation/TypingBubble';
import { ComposerBar } from './conversation/ComposerBar';
import { useTypingIndicator } from './conversation/useTypingIndicator';
import { useConversationThread } from './conversation/useConversationThread';
import { useMessageActions } from './conversation/useMessageActions';
import { useDmComposer } from './conversation/useDmComposer';
import { lastOwnMessageId, replyTargetId, type OtherUser } from './conversation/conversation-state';

export function ConversationView({
  conversationId,
  initialOtherUser,
}: {
  conversationId: string;
  /** The other participant, prefetched by the route loader (avoids fetching the
   * entire inbox client-side just to find them). */
  initialOtherUser?: OtherUser | null;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const { otherTyping, clearOtherTyping, handleTypingEvent, handleTyping, stopTyping } =
    useTypingIndicator({ conversationId, scrollToBottom });

  const {
    messages,
    setMessages,
    loading,
    hasOlder,
    loadingOlder,
    otherUser,
    notFound,
    historyIds,
    applyMutation,
    handleLoadOlder,
  } = useConversationThread({
    conversationId,
    initialOtherUser,
    session,
    scrollToBottom,
    clearOtherTyping,
    handleTypingEvent,
  });

  const {
    reactionMenu,
    setReactionMenu,
    reactionTriggerFor,
    editingId,
    setEditingId,
    savingEdit,
    handleSaveEdit,
    handleUnsend,
    handleHide,
    toggleReaction,
  } = useMessageActions({
    conversationId,
    session,
    messages,
    setMessages,
    historyIds,
    applyMutation,
  });

  // The message suggested replies would answer: the newest one, only when it is
  // theirs, carries text, and has not been unsent. Null (the common case)
  // renders no chips at all.
  const replyToMessageId = replyTargetId(messages, session?.user.id);

  // P04 — per-chat extras (see components/chat-plus): theme, pins, live ticks and
  // read receipts, slash commands, disappearing messages.
  const chatRef = useMemo(() => ({ kind: 'dm' as const, id: conversationId }), [conversationId]);
  const chatTheme = useChatTheme(chatRef);
  const { data: chatMeta } = useChatMeta(chatRef);
  const pinnedIds = useMemo(
    () => new Set((chatMeta?.pins ?? []).map((p) => p.messageId)),
    [chatMeta?.pins],
  );
  useChatUpdates(chatRef, (u) =>
    setMessages((prev) => applyChatUpdate(prev, u, session?.user.id ?? '')),
  );

  const composer = useDmComposer({
    conversationId,
    session,
    messages,
    setMessages,
    historyIds,
    otherUser,
    scrollToBottom,
    chatRef,
    handleTyping,
    stopTyping,
  });

  const shownMessages = useExpiring(messages);
  // M2: a conversation with yourself is Saved Messages.
  const isSavedChat = !!otherUser && otherUser.id === session?.user.id;
  // M8: the viewer's latest message, which is the one that carries "Seen".
  const lastOwnId = lastOwnMessageId(shownMessages, session?.user.id);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-4 pb-12 text-center">
        <p className="text-lg font-medium text-site-text mb-2">
          {t('sign-in-to-view-messages', { defaultValue: 'Sign in to view messages' })}
        </p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="default" size="sm">
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Button>
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-4 pb-12 text-center">
        <p className="text-lg font-medium text-site-text mb-2">
          {t('conversation-not-found', { defaultValue: 'Conversation not found' })}
        </p>
        <Link to="/messages">
          <Button variant="default" size="sm">
            {t('back-to-messages', { defaultValue: 'Back to Messages' })}
          </Button>
        </Link>
      </div>
    );
  }

  // The space the shell actually leaves, NOT `h-screen`.
  //
  // `h-screen` is `100vh` — the LARGE viewport on a phone — and this column sits
  // below the shell's 56px top bar inside a `<main>` that reserves `--rad-top` /
  // `--rad-bottom` for the floating dock. So the thread came out ~900px tall in
  // an 844px window: the document scrolled 242px WHILE the message list scrolled
  // its own 842px. Two scroll contexts fighting over one gesture, a composer
  // parked below the fold, and — because the page scrolls at all — no toolbar
  // collapse in mobile Safari.
  //
  // Subtracting the shell's own tokens (rather than a magic number) leaves the
  // page exactly viewport-height, so there is one scroller: the message list.
  //
  // `svh`, not `dvh`: the small viewport is the one with the browser toolbars
  // SHOWN, so sizing to it cannot overflow. `dvh` tracks whichever state the
  // toolbars are in, which means the column is briefly too tall every time they
  // expand — and the document starts scrolling again exactly when the user is
  // reaching for the composer.
  return (
    <div
      className="flex flex-col h-[calc(100svh-var(--rad-topbar-h,3.5rem)-var(--rad-top,0px)-var(--rad-bottom,0px))]"
      style={chatTheme.rootStyle}
    >
      <ConversationHeader
        conversationId={conversationId}
        chatRef={chatRef}
        otherUser={otherUser}
        isSavedChat={isSavedChat}
        viewerId={session.user.id}
      />

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={chatTheme.wallpaper}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {hasOlder && (
              <div className="flex justify-center mb-4">
                <button
                  onClick={handleLoadOlder}
                  disabled={loadingOlder}
                  className="text-sm text-site-accent hover:underline disabled:opacity-50"
                >
                  {loadingOlder
                    ? t('loading', { defaultValue: 'Loading…' })
                    : t('load-older-messages', { defaultValue: 'Load older messages' })}
                </button>
              </div>
            )}

            {shownMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-site-text-muted">
                  {t('no-messages-yet', {
                    defaultValue: 'No messages yet',
                  })}
                </p>
              </div>
            )}

            {shownMessages.map((msg, i) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                prevMsg={i > 0 ? shownMessages[i - 1] : null}
                nextMsg={i < shownMessages.length - 1 ? shownMessages[i + 1] : null}
                viewerId={session.user.id}
                selfAvatar={{
                  image: resolvedUser?.image || session.user.image,
                  name: resolvedUser?.name || session.user.name,
                }}
                otherUser={otherUser}
                isSavedChat={isSavedChat}
                isLastOwn={msg.id === lastOwnId}
                // New (sent/received) messages rise in; history renders in place.
                animateIn={!reducedMotion && !historyIds.current.has(msg.id)}
                pinned={pinnedIds.has(msg.id)}
                chatRef={chatRef}
                isEditing={editingId === msg.id}
                savingEdit={savingEdit}
                reactionTriggerFor={reactionTriggerFor}
                quoteReply={composer.quoteReply}
                onSaveEdit={handleSaveEdit}
                setEditingId={setEditingId}
                onUnsend={handleUnsend}
                onHide={handleHide}
                onToggleReaction={toggleReaction}
              />
            ))}

            {otherTyping && <TypingBubble otherUser={otherUser} />}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <ComposerBar
        conversationId={conversationId}
        chatRef={chatRef}
        composer={composer}
        replyToMessageId={replyToMessageId}
      />

      <ChatPlusHost viewerId={session.user.id} />

      {reactionMenu && (
        <ReactionMenu
          x={reactionMenu.x}
          y={reactionMenu.y}
          onSelect={(emoji) => toggleReaction(reactionMenu.messageId, emoji)}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </div>
  );
}
