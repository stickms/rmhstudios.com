'use client';

import { useFeedStore } from '@/stores/feedStore';

interface RMHarkContentProps {
  text: string;
  className?: string;
}

const HASHTAG_REGEX = /(#\w+)/g;

export function RMHarkContent({ text, className }: RMHarkContentProps) {
  const parts = text.split(HASHTAG_REGEX);

  if (parts.length === 1) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={className}>
      {parts.map((part, i) =>
        HASHTAG_REGEX.test(part) ? (
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
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}
