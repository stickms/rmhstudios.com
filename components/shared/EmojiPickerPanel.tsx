/**
 * Raw emoji picker panel (emoji-picker-react, Twemoji style to match the
 * global TwemojiProvider). Eagerly imports the library — always load this
 * component via React.lazy so the ~1MB picker stays out of the main bundle.
 */
'use client';

import { useCallback } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void;
  width?: number | string;
  height?: number;
}

export default function EmojiPickerPanel({
  onSelect,
  width = 300,
  height = 360,
}: EmojiPickerPanelProps) {
  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => onSelect(emojiData.emoji),
    [onSelect],
  );

  return (
    <EmojiPicker
      onEmojiClick={handleEmojiClick}
      theme={Theme.AUTO}
      emojiStyle={EmojiStyle.TWITTER}
      width={width}
      height={height}
      searchPlaceholder="Search emojis…"
      previewConfig={{ showPreview: false }}
      skinTonesDisabled={false}
      lazyLoadEmojis={true}
    />
  );
}
