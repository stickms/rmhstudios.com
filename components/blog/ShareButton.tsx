"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  slug: string;
  className?: string; // Allow overriding positioning/styles
}

export function ShareButton({ slug, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent ensuring link clicks if inside a card
    
    // Construct URL safely (client-side)
    const url = `${window.location.origin}/blog/${slug}`;
    navigator.clipboard.writeText(url);
    
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className={`p-2 rounded-full bg-black/60 text-white/70 hover:text-(--neon-cyan) hover:bg-black/80 transition-all backdrop-blur-md border border-white/10 flex items-center justify-center ${className || ""}`}
      title="Copy Link"
    >
      {copied ? (
        <span className="text-xs font-bold text-(--neon-cyan) animate-in fade-in zoom-in duration-200">
          Copied!
        </span>
      ) : (
        <Share2 className="w-4 h-4" />
      )}
    </button>
  );
}
