import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/contract/client';
import { typingApi } from '@/lib/messages/message-actions.contract';

/**
 * Typing-indicator bookkeeping, both directions: whether the other participant
 * is typing (with a safety timeout in case the matching "stopped typing" event
 * never arrives), and POSTing our own typing state with a debounced stop.
 */
export function useTypingIndicator({
  conversationId,
  scrollToBottom,
}: {
  conversationId: string;
  scrollToBottom: () => void;
}) {
  const [otherTyping, setOtherTyping] = useState(false);
  const typingActiveRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A delivered message means the other side is no longer typing.
  const clearOtherTyping = useCallback(() => {
    setOtherTyping(false);
    if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
  }, []);

  // Show/hide the other participant's typing indicator (with a safety timeout
  // in case the matching "stopped typing" event never arrives).
  const handleTypingEvent = useCallback(
    (isTyping: boolean) => {
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      setOtherTyping(isTyping);
      if (isTyping) {
        setTimeout(scrollToBottom, 100);
        otherTypingTimer.current = setTimeout(() => setOtherTyping(false), 10000);
      }
    },
    [scrollToBottom],
  );

  // POST our own typing state to the other participant (debounced stop).
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      api(typingApi, { params: { conversationId }, body: { isTyping } }).catch(() => {});
    },
    [conversationId],
  );

  const handleTyping = useCallback(() => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(false);
    }, 3000);
  }, [sendTyping]);

  const stopTyping = useCallback(() => {
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  // Reset the typing indicator and tell the other side we stopped when the
  // conversation changes or the component unmounts.
  useEffect(() => {
    return () => {
      stopTyping();
      if (otherTypingTimer.current) clearTimeout(otherTypingTimer.current);
      setOtherTyping(false);
    };
  }, [conversationId, stopTyping]);

  return { otherTyping, clearOtherTyping, handleTypingEvent, handleTyping, stopTyping };
}
