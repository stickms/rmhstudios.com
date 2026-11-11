import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { GifPicker } from './GifPicker';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { useItemReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { ChatPinnedBar } from '@/components/chat-plus/ChatPinnedBar';
import { ChatPlusHost } from '@/components/chat-plus/ChatPlusHost';
import { useChatMeta, useChatTheme, useExpiring } from '@/components/chat-plus/hooks';
import { GroupComposerBar } from './group-chat/GroupComposerBar';
import { GroupHeader } from './group-chat/GroupHeader';
import { GroupMessageRow } from './group-chat/GroupMessageRow';
import { PendingMedia } from './group-chat/PendingMedia';
import { PollComposer } from './group-chat/PollComposer';
import { useGroupComposer } from './group-chat/useGroupComposer';
import { useGroupMessageActions } from './group-chat/useGroupMessageActions';
import { useGroupThread } from './group-chat/useGroupThread';

export function GroupChatView({ id, currentUserId }: { id: string; currentUserId: string }) {
  const { t } = useTranslation('feed');
  const reducedMotion = useReducedMotion();
  // P04 — per-chat extras (see components/chat-plus).
  const chatRef = useMemo(() => ({ kind: 'group' as const, id }), [id]);
  const chatTheme = useChatTheme(chatRef);
  const { data: chatMeta } = useChatMeta(chatRef);
  const pinnedIds = useMemo(
    () => new Set((chatMeta?.pins ?? []).map((p) => p.messageId)),
    [chatMeta?.pins],
  );

  // Outside-press dismissal, Escape, focus return, the roving arrow keys and the
  // close animation all live in AnchoredMenu now (it portals to <body>, so the
  // attach menu is not measured inside `.radial-frame`'s stacking context).
  const thread = useGroupThread(id, currentUserId, chatRef);
  const { group, loading, notFound, appendMessages } = thread;
  const composer = useGroupComposer({ id, chatRef, appendMessages });
  const [reactionMenu, setReactionMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
  } | null>(null);
  const reactionTriggerFor = useItemReactionTrigger((x, y, messageId) =>
    setReactionMenu({ x, y, messageId }),
  );
  const { toggleReaction, vote, leave } = useGroupMessageActions({
    id,
    currentUserId,
    setMessages: thread.setMessages,
    patchMessage: thread.patchMessage,
  });
  const shownMessages = useExpiring(thread.messages);

  if (loading) {
    return (
      <div className="flex justify-center px-4 pt-4 pb-12">
        <Spinner />
      </div>
    );
  }
  if (notFound || !group) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-4 pb-12 text-center">
        <p className="font-medium text-site-text">
          {t('group-not-found', { defaultValue: 'Group not found' })}
        </p>
        <Link to="/messages" search={{ tab: 'groups' }}>
          <Button variant="default">
            {t('back-to-groups', { defaultValue: 'Back to groups' })}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100svh-var(--rad-topbar-h,3.5rem)-var(--rad-top,0px)-var(--rad-bottom,0px))] flex-col"
      style={chatTheme.rootStyle}
    >
      <GroupHeader group={group} chatRef={chatRef} onLeave={leave} />
      <ChatPinnedBar
        chat={chatRef}
        viewerId={currentUserId}
        names={Object.fromEntries(group.members.map((mem) => [mem.id, mem.name || mem.handle]))}
      />

      <div
        ref={thread.scrollRef}
        onScroll={thread.handleScroll}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        style={chatTheme.wallpaper}
      >
        {shownMessages.map((m) => (
          <GroupMessageRow
            key={m.id}
            message={m}
            group={group}
            chatRef={chatRef}
            groupId={id}
            currentUserId={currentUserId}
            animateIn={!reducedMotion && !thread.historyIds.current.has(m.id)}
            pinned={pinnedIds.has(m.id)}
            reactionTriggerFor={reactionTriggerFor}
            onVote={vote}
            onToggleReaction={toggleReaction}
          />
        ))}
      </div>

      {/* GIF picker */}
      {composer.showGifPicker && (
        <div className="border-t border-site-border p-2">
          <GifPicker
            onSelect={(url) => {
              composer.setGifUrl(url);
              composer.setShowGifPicker(false);
            }}
            onClose={() => composer.setShowGifPicker(false)}
          />
        </div>
      )}

      {/* Poll composer */}
      {composer.pollDraft && (
        <PollComposer
          draft={composer.pollDraft}
          onChange={composer.setPollDraft}
          onCancel={() => composer.setPollDraft(null)}
        />
      )}

      {/* Pending media preview */}
      {(composer.imageUrls.length > 0 || composer.gifUrl) && (
        <PendingMedia
          imageUrls={composer.imageUrls}
          gifUrl={composer.gifUrl}
          onRemoveImage={(url) => composer.setImageUrls((prev) => prev.filter((u) => u !== url))}
          onRemoveGif={() => composer.setGifUrl(null)}
        />
      )}

      <GroupComposerBar
        composer={composer}
        group={group}
        chatRef={chatRef}
        appendMessages={appendMessages}
      />

      <ChatPlusHost viewerId={currentUserId} />

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
