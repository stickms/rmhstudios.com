'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The profile song (P7): tap to play, never autoplay, nothing loaded until the
 * first tap.
 *
 * Two paths, chosen from what the member's pick carries:
 *
 *  • **A preview clip URL** — played with a plain `<audio>` element created on
 *    the first tap. No third-party script, nothing fetched before the tap.
 *  • **A Spotify track id only** (Spotify stopped returning preview clips for
 *    most tracks) — the first tap opens Spotify's own embed, which loads its
 *    iframe at that moment; the visitor presses play inside it. Previously the
 *    page loaded Spotify's iframe API for every profile with a song on first
 *    paint, and the controller it built was never attached to anything, so the
 *    vinyl could not play at all.
 */
export interface ProfileSongSource {
  spotifyId: string | null;
  previewUrl: string | null;
}

export interface ProfileSongControls {
  /** A preview clip is audibly playing (drives the spinning vinyl). */
  isPlaying: boolean;
  /** The Spotify embed is open (tap-to-load path). */
  embedOpen: boolean;
  toggle: () => void;
  closeEmbed: () => void;
}

export function useProfileSong(song: ProfileSongSource | null): ProfileSongControls {
  const [isPlaying, setIsPlaying] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const previewUrl = song?.previewUrl ?? null;
  const spotifyId = song?.spotifyId ?? null;

  // A different profile (or a different pick) starts silent and closed.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setEmbedOpen(false);
    };
  }, [previewUrl, spotifyId]);

  const toggle = useCallback(() => {
    if (previewUrl) {
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio(previewUrl);
        audio.preload = 'none';
        audio.addEventListener('playing', () => setIsPlaying(true));
        audio.addEventListener('pause', () => setIsPlaying(false));
        audio.addEventListener('ended', () => setIsPlaying(false));
        audioRef.current = audio;
      }
      if (audio.paused) {
        void audio.play().catch(() => setIsPlaying(false));
      } else {
        audio.pause();
      }
      return;
    }
    if (spotifyId) setEmbedOpen((open) => !open);
  }, [previewUrl, spotifyId]);

  const closeEmbed = useCallback(() => setEmbedOpen(false), []);

  return { isPlaying, embedOpen, toggle, closeEmbed };
}
