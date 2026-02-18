'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface CipherPuzzleProps {
    targetWord: string;
    onComplete: () => void;
}

export const CipherPuzzle = ({ targetWord, onComplete }: CipherPuzzleProps) => {
    const [scrambled, setScrambled] = useState('');
    const [guess, setGuess] = useState('');
    
    useEffect(() => {
        // Scramble
        const arr = targetWord.split('');
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        setScrambled(arr.join('').toUpperCase());
    }, [targetWord]);

    const handleInput = (char: string) => {
        const newGuess = guess + char;
        setGuess(newGuess);
        
        if (newGuess.length === targetWord.length) {
            if (newGuess.toLowerCase() === targetWord.toLowerCase()) {
                onComplete();
            } else {
                // Shake effect or reset
                setTimeout(() => setGuess(''), 500);
            }
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 p-4">
            <div className="text-sm text-neon-cyan uppercase tracking-widest">Descramble the Echo</div>
            
            <div className="flex gap-2">
                {targetWord.split('').map((_, i) => (
                    <div key={i} className="w-10 h-12 border-b-2 border-white/20 flex items-center justify-center text-2xl font-mono text-neon-pink">
                        {guess[i] || ''}
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                {scrambled.split('').map((char, i) => (
                    <motion.button
                        key={i}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="w-12 h-12 rounded bg-white/5 border border-white/10 hover:border-neon-cyan hover:bg-neon-cyan/20 text-white font-bold"
                        onClick={() => handleInput(char)}
                        disabled={guess.length >= targetWord.length}
                    >
                        {char}
                    </motion.button>
                ))}
            </div>

            <Button variant="ghost" className="text-xs text-gray-500 hover:text-white" onClick={() => setGuess('')}>
                Reset
            </Button>
        </div>
    );
};
