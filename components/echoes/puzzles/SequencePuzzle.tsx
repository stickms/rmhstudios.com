'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface SequencePuzzleProps {
    sequence: number[]; // e.g. [0, 2, 1, 3]
    onComplete: () => void;
}

export const SequencePuzzle = ({ sequence, onComplete }: SequencePuzzleProps) => {
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [playerInput, setPlayerInput] = useState<number[]>([]);
    const [showingSequence, setShowingSequence] = useState(false);

    useEffect(() => {
        playSequence();
    }, []);

    const playSequence = async () => {
        setShowingSequence(true);
        setPlayerInput([]);
        
        for (let i = 0; i < sequence.length; i++) {
            await new Promise(r => setTimeout(r, 600));
            setActiveIdx(sequence[i]);
            await new Promise(r => setTimeout(r, 600));
            setActiveIdx(null);
        }
        setShowingSequence(false);
    };

    const handleTap = (idx: number) => {
        if (showingSequence) return;
        
        const newInput = [...playerInput, idx];
        setPlayerInput(newInput);
        
        // Flash
        setActiveIdx(idx);
        setTimeout(() => setActiveIdx(null), 200);

        // Check Validity
        if (sequence[newInput.length - 1] !== idx) {
            // Wrong
            setTimeout(() => {
                alert("Sequence failed. Retrying..."); // temporary
                playSequence();
            }, 500);
        } else if (newInput.length === sequence.length) {
            // Done
            onComplete();
        }
    };

    return (
        <div className="flex flex-col items-center gap-8 p-4">
             <div className="text-sm text-neon-pink uppercase tracking-widest">
                {showingSequence ? 'Watch Pattern' : 'Repeat Pattern'}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((idx) => (
                    <motion.div
                        key={idx}
                        className={`w-24 h-24 rounded-xl border-2 cursor-pointer transition-all duration-200
                            ${activeIdx === idx 
                                ? 'bg-neon-cyan border-white shadow-[0_0_20px_#00ffff]' 
                                : 'bg-white/5 border-white/10 hover:border-white/30'
                            }
                        `}
                        onClick={() => handleTap(idx)}
                        whileTap={{ scale: 0.95 }}
                    />
                ))}
            </div>
        </div>
    );
};
