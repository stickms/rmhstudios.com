'use client';

import { useNarrativeStore, DialogueNode } from '@/lib/echoes/campaign/NarrativeStore';
import { useEffect, useState } from 'react';
import { script } from '../../../lib/echoes/campaign/script';
import { motion, AnimatePresence } from 'framer-motion';

export default function DialogueOverlay() {
    const { currentDialogueId, endDialogue, startDialogue } = useNarrativeStore();
    const [node, setNode] = useState<DialogueNode | null>(null);

    useEffect(() => {
        if (!currentDialogueId) {
            setNode(null);
            return;
        }
        
        // Fetch node from script (mock for now if script doesn't exist)
        // In real app, script would be a lookup map
        const foundNode = script[currentDialogueId];
        if (foundNode) {
            setNode(foundNode);
        } else {
            console.warn(`Dialogue node ${currentDialogueId} not found`);
            endDialogue();
        }
    }, [currentDialogueId, endDialogue]);

    if (!node) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[800px] h-[250px] bg-black/90 border border-neon-purple/50 p-6 rounded-lg shadow-neon backdrop-blur-md z-50 flex flex-col pointer-events-auto"
            >
                {/* Speaker Name */}
                <div className="text-neon-pink font-bold text-xl mb-2 flex items-center gap-2">
                    <span className="w-2 h-8 bg-neon-pink block" />
                    {node.speaker || 'Unknown'}
                </div>

                {/* Text */}
                <p className="text-white text-lg leading-relaxed flex-grow font-mono">
                    {node.text}
                </p>

                {/* Choices */}
                <div className="flex gap-4 mt-4 justify-end">
                    {node.choices ? (
                        node.choices.map((choice, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    if (choice.effect) choice.effect();
                                    startDialogue(choice.nextId);
                                }}
                                className="px-6 py-2 bg-neon-purple/20 border border-neon-purple hover:bg-neon-purple hover:text-white transition-colors text-neon-purple rounded uppercase text-sm font-bold tracking-wider"
                            >
                                {choice.text}
                            </button>
                        ))
                    ) : (
                        <button
                             onClick={() => endDialogue()}
                             className="px-6 py-2 bg-neutral-800 border border-white/20 hover:bg-white hover:text-black transition-colors text-white rounded uppercase text-sm font-bold tracking-wider"
                        >
                            Close
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
