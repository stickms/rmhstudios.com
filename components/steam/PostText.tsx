import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Handle } from '@/components/ui/handle';
import { splitEmotes, type EmoteMotif } from '@/lib/games/customize';
import type { ThreadMentions } from '@/lib/games/hub-types';
import { tokenizeMentions } from '@/lib/games/thread-text';
import { Emote } from './Emote';

type Piece =
  | { type: 'text'; text: string }
  | { type: 'mention'; handle: string; to: string; name: string }
  | { type: 'emote'; gameId: string; motif: EmoteMotif };

/**
 * A post's text, with `:title-motif:` tokens drawn as emoticons for titles the AUTHOR owns
 * (anyone else's token stays as typed) and `@handle` drawn as a link to the member's profile when the page resolved the
 * handle to one (an unknown handle stays as typed). Everything else is plain text, never markup. The body is
 * `dir="auto"` and each handle is its own `<bdi>` run, so the `@` stays first in a right-to-left body.
 */
export function PostText({
  text,
  ownedTitles,
  mentions,
  className,
}: {
  text: string;
  ownedTitles: string[];
  /** The handles on this page that belong to a member; leave out for text that never links. */
  mentions?: ThreadMentions;
  className?: string;
}) {
  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [];
    for (const s of splitEmotes(text, new Set(ownedTitles))) {
      if (s.type !== 'text') {
        out.push({ type: 'emote', gameId: s.gameId, motif: s.motif });
        continue;
      }
      for (const part of tokenizeMentions(s.text, (h) => mentions?.[h.toLowerCase()] !== undefined)) {
        if (part.type === 'text') {
          out.push(part);
          continue;
        }
        const member = mentions?.[part.handle.toLowerCase()];
        if (member) out.push({ type: 'mention', handle: part.handle, to: member.handle, name: member.name });
      }
    }
    return out;
  }, [text, ownedTitles, mentions]);
  return (
    <p className={className} dir="auto">
      {pieces.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : s.type === 'mention' ? (
          <Link key={i} to="/games/profile/$id" params={{ id: s.to }} className="stm-link" title={s.name}>
            <Handle handle={s.handle} />
          </Link>
        ) : (
          <Emote key={i} gameId={s.gameId} motif={s.motif} />
        ),
      )}
    </p>
  );
}
