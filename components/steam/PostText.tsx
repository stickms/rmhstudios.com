'use client';

import { useMemo } from 'react';
import { splitEmotes } from '@/lib/games/customize';
import { Emote } from './Emote';

/**
 * A post's text, with `:title-motif:` tokens drawn as emoticons for titles the AUTHOR owns
 * (anyone else's token stays as typed). Everything else is plain text, never markup.
 */
export function PostText({ text, ownedTitles, className }: { text: string; ownedTitles: string[]; className?: string }) {
  const segments = useMemo(() => splitEmotes(text, new Set(ownedTitles)), [text, ownedTitles]);
  return (
    <p className={className}>
      {segments.map((s, i) =>
        s.type === 'text' ? <span key={i}>{s.text}</span> : <Emote key={i} gameId={s.gameId} motif={s.motif} />,
      )}
    </p>
  );
}
