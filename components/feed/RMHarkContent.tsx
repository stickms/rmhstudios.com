'use client';

import { useFeedStore } from '@/stores/feedStore';

interface RMHarkContentProps {
  text: string;
  className?: string;
}

const TOKEN_REGEX = /(#\w+|https?:\/\/[^\s<>"']+)/gi;
const URL_REGEX = /^https?:\/\//i;

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

export function RMHarkContent({ text, className }: RMHarkContentProps) {
  const parts = text.split(TOKEN_REGEX);

  if (parts.length === 1) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (/^#\w+$/.test(part)) {
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                useFeedStore.getState().setSearch(part);
              }}
              className="text-site-accent hover:underline"
            >
              {part}
            </button>
          );
        }
        if (URL_REGEX.test(part)) {
          return (
            <a
              key={i}
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
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
