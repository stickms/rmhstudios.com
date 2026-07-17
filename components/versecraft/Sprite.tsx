'use client';

import { m as motion } from 'framer-motion';
import type { Emotion } from '@/lib/versecraft/gen/world-types';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';

interface SpriteProps {
  packId: string;
  emotion?: Emotion;
  position: 'left' | 'center' | 'right';
  isSpeaking?: boolean;
  /** Accent color used for the soft glow under the sprite. */
  accent?: string;
  dialogueBoxHeight: number;
}

/**
 * Renders a generated character's curated sprite at the right emotion. Swapping
 * `emotion` swaps the source image so the face matches the line being spoken;
 * the non-speaking cast is dimmed and pushed back.
 */
export function Sprite({ packId, emotion = 'neutral', position, isSpeaking, accent = '#c4a35a', dialogueBoxHeight }: SpriteProps) {
  const url = spriteUrl(packId, emotion);
  if (!url) return null;

  const xPos = position === 'left' ? '24%' : position === 'right' ? '76%' : '50%';

  return (
    <motion.div
      className="absolute flex flex-col items-center"
      style={{
        left: xPos,
        transform: 'translateX(-50%)',
        filter: isSpeaking ? 'none' : 'brightness(0.62) saturate(0.85)',
        zIndex: isSpeaking ? 10 : 5,
      }}
      initial={{ opacity: 0, y: 24, bottom: dialogueBoxHeight * 0.78 }}
      animate={{
        opacity: 1,
        bottom: dialogueBoxHeight * 0.78,
        y: [0, -4, 0],
        scale: isSpeaking ? 1.03 : 0.97,
      }}
      transition={{
        opacity: { duration: 0.4 },
        bottom: { type: 'spring', stiffness: 120, damping: 20 },
        y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
        scale: { duration: 0.3 },
      }}
    >
      <div className="relative w-[42vw] max-w-[16rem] h-[52vh] sm:w-56 sm:h-96 md:w-72 md:h-[34rem]">
        {/* Plain <img> with a stable element (no key) so changing the emotion
            just swaps the src of an already-preloaded image — instant, no
            flicker. The gentle bob/scale lives on the wrapper above. */}
        <img
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain object-bottom"
          loading="eager"
          decoding="async"
          draggable={false}
        />
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-8 rounded-full blur-xl"
          style={{ backgroundColor: `${accent}33` }}
        />
      </div>
    </motion.div>
  );
}
