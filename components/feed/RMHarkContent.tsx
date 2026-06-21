'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';

interface RMHarkContentProps {
  text: string;
  className?: string;
}

const TOKEN_REGEX = /(@\w+|#\w+|https?:\/\/[^\s<>"']+)/gi;
const URL_REGEX = /^https?:\/\//i;
// Spoilers are wrapped in double pipes, Discord-style: ||hidden text||
const SPOILER_REGEX = /\|\|([\s\S]+?)\|\|/g;

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

/** Render plain text with @mentions, #hashtags, and links linkified. */
function renderTokens(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(TOKEN_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^@\w+$/.test(part)) {
      return (
        <Link
          key={key}
          to="/u/$userid"
          params={{ userid: part.slice(1) }}
          onClick={(e) => e.stopPropagation()}
          className="text-sky-400 hover:text-sky-300 hover:underline"
        >
          {part}
        </Link>
      );
    }
    if (/^#\w+$/.test(part)) {
      return (
        <Link
          key={key}
          to={`/tag/${part.slice(1)}` as string}
          onClick={(e) => e.stopPropagation()}
          className="text-sky-400 hover:text-sky-300 hover:underline font-medium"
        >
          {part}
        </Link>
      );
    }
    if (URL_REGEX.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-site-accent hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

/** Click-to-reveal blurred span for spoiler-tagged text. */
function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={revealed ? 'Spoiler revealed' : 'Reveal spoiler'}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }
      }}
      className={
        revealed
          ? 'rounded bg-site-surface/60 px-0.5'
          : 'cursor-pointer select-none rounded bg-site-text/15 px-0.5 text-transparent transition-colors hover:bg-site-text/25 [filter:blur(4px)]'
      }
    >
      {children}
    </span>
  );
}

export function RMHarkContent({ text, className }: RMHarkContentProps) {
  // Split out spoilers first so their inner text stays hidden, then linkify
  // the surrounding plain segments.
  const segments: React.ReactNode[] = [];
  let last = 0;
  let segIdx = 0;
  let m: RegExpExecArray | null;
  SPOILER_REGEX.lastIndex = 0;
  while ((m = SPOILER_REGEX.exec(text)) !== null) {
    if (m.index > last) {
      segments.push(<span key={`t-${segIdx}`}>{renderTokens(text.slice(last, m.index), `t-${segIdx}`)}</span>);
      segIdx++;
    }
    segments.push(<Spoiler key={`s-${segIdx}`}>{renderTokens(m[1], `s-${segIdx}`)}</Spoiler>);
    segIdx++;
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push(<span key={`t-${segIdx}`}>{renderTokens(text.slice(last), `t-${segIdx}`)}</span>);
  }

  return <p className={className}>{segments.length > 0 ? segments : text}</p>;
}
