import { useEffect, useState, useRef } from 'react';
import { AudioManager } from './AudioManager';

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const audioManager = useRef(AudioManager.getInstance());
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    audioManager.current.initialize();
    
    const updateLoop = () => {
      if (audioManager.current) {
        setCurrentTime(audioManager.current.getCurrentTime());
      }
      rafId.current = requestAnimationFrame(updateLoop);
    };
    
    rafId.current = requestAnimationFrame(updateLoop);
    
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const loadTrack = async (url: string) => {
    await audioManager.current.loadTrack(url);
    setDuration(audioManager.current.getDuration());
  };

  const play = () => {
    audioManager.current.play();
    setIsPlaying(true);
  };

  const pause = () => {
    audioManager.current.pause();
    setIsPlaying(false);
  };
  
  const stop = () => {
    audioManager.current.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };
  
  const setRate = (rate: number) => {
      audioManager.current.setPlaybackRate(rate);
      setPlaybackRate(rate);
  }
  
  const setVolume = (vol: number) => {
      audioManager.current.setVolume(vol);
  }

  return {
    loadTrack,
    play,
    pause,
    stop,
    setRate,
    isPlaying,
    duration,
    currentTime,
    playbackRate,
    setVolume
  };
}
