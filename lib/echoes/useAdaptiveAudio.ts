'use client';

import { useEchoesStore } from '@/lib/store/useEchoesStore';
import { useEffect, useRef } from 'react';
import { Howl } from 'howler';

export const useAdaptiveAudio = () => {
    const { entropy, gameStarted, isGameOver } = useEchoesStore();
    
    // Refs to hold Howl instances
    const droneRef = useRef<Howl | null>(null);
    const staticRef = useRef<Howl | null>(null);

    useEffect(() => {
        // Initialize Audio
        droneRef.current = new Howl({
            src: ['/audio/echoes_drone.mp3'], // Placeholder path
            loop: true,
            volume: 0,
            autoplay: false
        });

        staticRef.current = new Howl({
            src: ['/audio/echoes_static.mp3'], // Placeholder path
            loop: true,
            volume: 0,
            autoplay: false
        });

        return () => {
            droneRef.current?.unload();
            staticRef.current?.unload();
        };
    }, []);

    // Control Playback State
    useEffect(() => {
        if (gameStarted && !isGameOver) {
            if (!droneRef.current?.playing()) droneRef.current?.play();
            if (!staticRef.current?.playing()) staticRef.current?.play();
            
            droneRef.current?.fade(0, 0.5, 2000); // Fade in drone
        } else {
            droneRef.current?.fade(droneRef.current.volume(), 0, 1000);
            staticRef.current?.fade(staticRef.current.volume(), 0, 1000);
            
            if (isGameOver) {
                // maybe play a glitch sound here?
            }
        }
    }, [gameStarted, isGameOver]);

    // Adaptive Volume based on Entropy
    useEffect(() => {
        if (!gameStarted || isGameOver) return;

        // Drone gets quieter as entropy rises (reality fades)
        const droneVol = 0.5 * (1 - (entropy / 150)); 
        droneRef.current?.volume(Math.max(0, droneVol));

        // Static gets louder as entropy rises
        // Starts fading in at 20% entropy, max at 100%
        let staticVol = 0;
        if (entropy > 20) {
            staticVol = ((entropy - 20) / 80) * 0.4;
        }
        staticRef.current?.volume(Math.min(0.4, staticVol));

    }, [entropy, gameStarted, isGameOver]);
};
