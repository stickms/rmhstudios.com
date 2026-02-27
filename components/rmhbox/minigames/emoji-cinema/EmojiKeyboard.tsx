/**
 * EmojiKeyboard — Emoji picker using emoji-picker-react with Twemoji
 * for a unified look across all platforms.
 *
 * Uses the React component import (not web component) as recommended.
 * Respects RMHbox theming (light/dark mode).
 */
'use client';

import { useCallback } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';

interface EmojiKeyboardProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiKeyboard({ onSelect }: EmojiKeyboardProps) {
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';

  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      onSelect(emojiData.emoji);
    },
    [onSelect],
  );

  return (
    <div className="w-full flex flex-col gap-2">
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        theme={theme === 'light' ? Theme.LIGHT : Theme.DARK}
        emojiStyle={EmojiStyle.TWITTER}
        width="100%"
        height={320}
        searchPlaceholder="Search emojis…"
        previewConfig={{ showPreview: false }}
        skinTonesDisabled={false}
        lazyLoadEmojis={true}
      />
    </div>
  );
}
