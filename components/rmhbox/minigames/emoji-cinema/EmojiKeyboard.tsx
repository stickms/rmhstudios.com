'use client';

import { useState, useMemo } from 'react';

const EMOJI_PALETTE: Record<string, string[]> = {
  'Faces': ['😀','😂','😍','😎','😱','😭','🤔','😡','🥳','😴','🤢','👻','💀','🤖','👽','🤡'],
  'People': ['👤','👫','👨‍👩‍👧','🧑‍🚀','🧙','🦸','🧛','🧟','💃','🕺','👑','💍','👶','🧓','🙋','🤷'],
  'Animals': ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐸','🐵','🦁','🐯','🐮','🐷','🐙','🦈','🦋'],
  'Nature': ['🌲','🌊','🌙','⭐','☀️','🌈','🔥','❄️','🌸','🍀','🌵','🍄','🌋','⛰️','🏝️','🌪️'],
  'Food': ['🍕','🍔','🍟','🌮','🍣','🍩','🎂','🍎','🍌','🍷','☕','🍿','🧁','🍫','🥩','🍗'],
  'Travel': ['🚗','✈️','🚀','🚢','🏠','🏰','🗽','🗼','🎡','🚂','🛸','🚁','🏎️','🛶','🚲','🏕️'],
  'Objects': ['💰','💎','🔫','🗡️','💣','🔮','📱','💻','📷','🎸','🎹','🎤','📚','✉️','🔑','⏰'],
  'Symbols': ['❤️','💔','✨','💥','💫','🎵','🎶','⚡','🔒','🔓','⚠️','🏴‍☠️','🎯','♟️','🧩','🎲'],
  'Activities': ['🎬','🎭','🎪','🏆','🥇','⚽','🏀','🎳','🎮','🎰','🎻','🎨','🎤','🎧','📺','🎥'],
};

interface EmojiKeyboardProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiKeyboard({ onSelect }: EmojiKeyboardProps) {
  const categories = Object.keys(EMOJI_PALETTE);
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [search, setSearch] = useState('');

  const displayEmojis = useMemo(() => {
    if (search.trim()) {
      return Object.values(EMOJI_PALETTE).flat().filter((e) =>
        e.includes(search.trim()),
      );
    }
    return EMOJI_PALETTE[activeCategory] ?? [];
  }, [activeCategory, search]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <input
        type="text"
        placeholder="Search emojis…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-(--rmhbox-surface) text-(--rmhbox-text) border border-(--rmhbox-border) text-sm outline-none"
      />
      {!search && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-(--rmhbox-accent) text-white'
                  : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) hover:bg-(--rmhbox-border)'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto p-1">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className="text-2xl p-1 rounded hover:bg-(--rmhbox-surface) transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
