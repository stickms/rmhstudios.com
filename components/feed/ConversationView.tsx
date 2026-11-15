import { useCallback, useMemo, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { Spine, SpineItem } from '@/components/ui/spine';
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
import './conversation/conversation.css';
import { lastOwnMessageId, replyTargetId, type OtherUser } from './conversation/conversation-state';
import { NoGlobe } from '@/components/shell/NoGlobe';

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

  const { t } = useTranslation('feed');
  const { data: session } = useSession();

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
  // Steel M9: the thread replaces the spinner; a message from them that arrives live, or an older page, fades in. Your
  // own sends do not (they are optimistic rows).
  const arrival = useArrival(!loading);
  const isNew = useArrivingKeys(loading ? [] : shownMessages.map((m) => m.id));

  if (!session) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="t-heading">
          {t('sign-in-to-view-messages', { defaultValue: 'Sign in to view messages' })}
        </p>
        <Button asChild>
          <Link to="/login" search={{ callbackURL: undefined }}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        </Button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="t-heading">
          {t('conversation-not-found', { defaultValue: 'Conversation not found' })}
        </p>
        <Button asChild>
          <Link to="/messages">{t('back-to-messages', { defaultValue: 'Back to Messages' })}</Link>
        </Button>
      </div>
    );
  }

  // The column is exactly as tall as the window leaves it (`.conversation`, conversation.css), so there is one scroller:
  // the message list. See that file for the numbers.
  return (
    <div className="conversation" style={chatTheme.rootStyle}>
      <NoGlobe />
      <ConversationHeader
        conversationId={conversationId}
        chatRef={chatRef}
        otherUser={otherUser}
        isSavedChat={isSavedChat}
        viewerId={session.user.id}
      />

      {/* Messages: one spine. Their messages hang on it, yours are right aligned, days are stations. */}
      <div ref={messagesContainerRef} className="conversation__thread" style={chatTheme.wallpaper}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : (
          <Spine className={arrival}>
            {hasOlder && (
              <SpineItem dot={false} className="spine-item--tight">
                <Button variant="ghost" onClick={handleLoadOlder} disabled={loadingOlder}>
                  {loadingOlder
                    ? t('loading', { defaultValue: 'Loading…' })
                    : t('load-older-messages', { defaultValue: 'Load older messages' })}
                </Button>
              </SpineItem>
            )}

            {shownMessages.length === 0 && (
              <SpineItem dot={false}>
                <p className="t-body text-site-text-muted">
                  {t('no-messages-yet', {
                    defaultValue: 'No messages yet',
                  })}
                </p>
              </SpineItem>
            )}

            {shownMessages.map((msg, i) => (
              <MessageRow
                key={msg.id}
                className={isNew(msg.id) && msg.senderId !== session.user.id ? ARRIVE : undefined}
                msg={msg}
                prevMsg={i > 0 ? shownMessages[i - 1] : null}
                viewerId={session.user.id}
                otherUser={otherUser}
                isSavedChat={isSavedChat}
                isLastOwn={msg.id === lastOwnId}
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
          </Spine>
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
