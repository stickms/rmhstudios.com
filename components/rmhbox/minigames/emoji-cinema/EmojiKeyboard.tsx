/**
 * EmojiKeyboard — Emoji picker using emoji-picker-react with Twemoji
 * for a unified look across all platforms (native emoji inside a Discord
 * Activity, whose CSP blocks the Twemoji CDN).
 *
 * Uses the React component import (not web component) as recommended.
 * Respects RMHbox theming (light/dark mode).
 */

import {
  useCallback,
  useState,
} from 'react';
import EmojiPicker, {
  EmojiClickData,
  Theme,
  EmojiStyle,
} from 'emoji-picker-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { isDiscordActivity } from '@/lib/discord-activity';

interface EmojiKeyboardProps {
  onSelect: (
    emoji: string,
  ) => void;
}

export default function EmojiKeyboard({
  onSelect,
}: EmojiKeyboardProps) {
  const theme =
    useRMHboxStore(
      (
        s,
      ) =>
        s
          .settings
          .theme,
    ) ??
    'dark';
  // Twitter-style images load from cdn.jsdelivr.net, which the Discord Activity
  // iframe blocks — the grid would render empty. Use the platform's own emoji there.
  const [
    emojiStyle,
  ] =
    useState(
      () =>
        isDiscordActivity()
          ? EmojiStyle.NATIVE
          : EmojiStyle.TWITTER,
    );

  const handleEmojiClick =
    useCallback(
      (
        emojiData: EmojiClickData,
      ) => {
        onSelect(
          emojiData.emoji,
        );
      },
      [
        onSelect,
      ],
    );

  return (
    <div className="w-full flex flex-col gap-2">
      <EmojiPicker
        onEmojiClick={
          handleEmojiClick
        }
        theme={
          theme ===
          'light'
            ? Theme.LIGHT
            : Theme.DARK
        }
        emojiStyle={
          emojiStyle
        }
        width="100%"
        height={
          320
        }
        searchPlaceholder="Search emojis…"
        previewConfig={{
          showPreview: false,
        }}
        skinTonesDisabled={
          false
        }
        lazyLoadEmojis={
          true
        }
      />
    </div>
  );
}
