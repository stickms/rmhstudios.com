'use client';

import { useState } from 'react';
import { Pause, Play } from '@/lib/icons';

interface VinylRecordProps {
  albumArt: string;
  title: string;
  artist: string;
  isPlaying: boolean;
  onToggle: () => void;
}

export function VinylRecord({
  albumArt,
  title,
  artist,
  isPlaying,
  onToggle,
}: VinylRecordProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative w-14 h-14 rounded-full cursor-pointer focus:outline-none group"
        title={isPlaying ? `Pause ${title}` : `Play ${title}`}
      >
        {/* Vinyl disc body */}
        <div
          className="absolute inset-0 rounded-full bg-[#1a1a1a] shadow-lg"
          style={{
            background: `
              radial-gradient(circle at center,
                transparent 32%,
                rgba(40,40,40,0.8) 33%,
                rgba(20,20,20,0.9) 34%,
                transparent 35%,
                transparent 44%,
                rgba(40,40,40,0.5) 45%,
                rgba(20,20,20,0.6) 46%,
                transparent 47%,
                transparent 56%,
                rgba(40,40,40,0.4) 57%,
                rgba(20,20,20,0.5) 58%,
                transparent 59%,
                transparent 68%,
                rgba(40,40,40,0.3) 69%,
                rgba(20,20,20,0.4) 70%,
                transparent 71%,
                transparent 80%,
                rgba(40,40,40,0.2) 81%,
                rgba(20,20,20,0.3) 82%,
                transparent 83%,
                transparent 90%,
                rgba(30,30,30,0.5) 91%,
                #1a1a1a 100%
              )
            `,
            backgroundColor: '#1a1a1a',
            animation: isPlaying ? 'vinyl-spin 3s linear infinite' : 'none',
          }}
        >
          {/* Center label with album art */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[38%] h-[38%] rounded-full overflow-hidden border border-black/30">
            <img
              src={albumArt}
              alt={title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>

          {/* Center spindle dot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-black/60" />
        </div>

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 rounded-full flex items-center justify-center transition-opacity ${
            hovered ? 'opacity-100' : 'opacity-0'
          } bg-black/40`}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-white fill-white" />
          ) : (
            <Play className="w-5 h-5 text-white fill-white" />
          )}
        </div>
      </button>

      {/* Song info */}
      <div className="text-center max-w-[72px]">
        <p className="text-[10px] text-site-text font-medium truncate leading-tight">{title}</p>
        <p className="text-[9px] text-site-text-dim truncate leading-tight">{artist}</p>
      </div>
    </div>
  );
}
