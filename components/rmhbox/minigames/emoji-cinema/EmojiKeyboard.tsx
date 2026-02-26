/**
 * EmojiKeyboard — Emoji picker using emoji-mart with twemoji for
 * a unified look across all platforms.
 *
 * Respects RMHbox theming (light/dark mode, accent color).
 * Replaces the previous static palette with a full emoji picker.
 */
'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import data from '@emoji-mart/data';

interface EmojiKeyboardProps {
  onSelect: (emoji: string) => void;
}

// Emoji-mart provides its own Picker component via dynamic import or init
// We use the web component approach for maximum compatibility

export default function EmojiKeyboard({ onSelect }: EmojiKeyboardProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';
  const callbackRef = useRef(onSelect);
  callbackRef.current = onSelect;

  const initPicker = useCallback(async () => {
    const container = pickerRef.current;
    if (!container) return;

    // Dynamically import emoji-mart to avoid SSR issues
    const { Picker } = await import('emoji-mart');

    // Clear any previous picker
    container.innerHTML = '';

    // Create the picker instance as a web component
    const picker = new Picker({
      data,
      onEmojiSelect: (emoji: { native: string }) => {
        callbackRef.current(emoji.native);
      },
      set: 'twitter', // Use Twitter emoji set (Twemoji)
      theme: theme === 'light' ? 'light' : 'dark',
      previewPosition: 'none',
      skinTonePosition: 'search',
      maxFrequentRows: 2,
      perLine: 8,
      emojiSize: 28,
      emojiButtonSize: 36,
      dynamicWidth: true,
    });

    container.appendChild(picker as unknown as Node);
  }, [theme]);

  useEffect(() => {
    initPicker();
  }, [initPicker]);

  return (
    <div className="w-full flex flex-col gap-2">
      <div
        ref={pickerRef}
        className="w-full [&>em-emoji-picker]:w-full [&>em-emoji-picker]:max-h-[280px] [&>em-emoji-picker]:border-none"
      />
    </div>
  );
}
