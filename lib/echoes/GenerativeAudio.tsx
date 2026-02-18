'use client';

import { useEffect, useRef } from 'react';
import { useEchoesStore } from '@/lib/store/useEchoesStore';

export const GenerativeAudio = () => {
    const { gameStarted, isGameOver } = useEchoesStore();
    const actx = useRef<AudioContext | null>(null);
    const masterGain = useRef<GainNode | null>(null);
    const notes = [261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 466.16]; // C minorish scale
    
    useEffect(() => {
        const initAudio = () => {
            if (!actx.current) {
                actx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                masterGain.current = actx.current.createGain();
                masterGain.current.gain.value = 0.3; // Low volume for calm background
                masterGain.current.connect(actx.current.destination);
            }
        };

        if (gameStarted && !isGameOver) {
             initAudio();
             if (actx.current?.state === 'suspended') actx.current.resume();
             startProceduralLoop();
        } else {
             if (actx.current) actx.current.suspend();
        }

        return () => {
            actx.current?.close();
            actx.current = null;
        };
    }, [gameStarted, isGameOver]);

    const playNote = () => {
        if (!actx.current || !masterGain.current) return;
        
        const osc = actx.current.createOscillator();
        const gain = actx.current.createGain();
        
        // Random note from scale
        const freq = notes[Math.floor(Math.random() * notes.length)] * (Math.random() > 0.5 ? 0.5 : 1); 
        osc.frequency.value = freq;
        osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
        
        osc.connect(gain);
        gain.connect(masterGain.current);
        
        const now = actx.current.currentTime;
        // Long attack and release for "pad" sound
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 2); // 2s attack
        gain.gain.exponentialRampToValueAtTime(0.001, now + 8); // 6s release
        
        osc.start(now);
        osc.stop(now + 8);
    };

    const startProceduralLoop = () => {
        const loop = () => {
            if (!actx.current || actx.current.state === 'suspended') return;
            playNote();
            setTimeout(loop, 4000 + Math.random() * 3000); // Play new note every 4-7 seconds
        };
        loop();
    };

    return null; // Invisible component
};
