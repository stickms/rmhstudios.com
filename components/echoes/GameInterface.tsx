'use client';

import { useEchoesStore } from '@/lib/store/useEchoesStore';
import { NodeCard } from './NodeCard';
import { VoidOverlay } from './VoidOverlay';
import { STORY_NODES } from '@/lib/echoes/story-nodes';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress"; // Assuming shadcn progress exists or allow raw fallback

import { GenerativeAudio } from '@/lib/echoes/GenerativeAudio';

export const GameInterface = () => {
    // Replaced useAdaptiveAudio hook with component
    
    const store = useEchoesStore();
    const { 
        memories, 
        entropy, 
        currentTimeline, 
        isGameOver, 
        gameStarted, 
        startGame, 
        unlockNode, 
        setCurrentTimeline, 
        spendMemories, 
        increaseEntropy,
        resetGame
    } = store;

    // Game Loop for Entropy
    useEffect(() => {
        if (!gameStarted || isGameOver) return;
        
        const timer = setInterval(() => {
            // Increase entropy slowly: 0.5 per second
            increaseEntropy(0.5);
        }, 1000);

        return () => clearInterval(timer);
    }, [gameStarted, isGameOver, increaseEntropy]);

    const currentNode = STORY_NODES[currentTimeline];

    const handleChoice = (choice: any) => {
        if (choice.cost) {
            if (!spendMemories(choice.cost)) return;
        }
        
        if (choice.effect) {
             choice.effect(store); // Pass full store state & actions
        }

        const nextNode = STORY_NODES[choice.nextNodeId];
        if (nextNode) {
            // Apply node entropy check?
            if (nextNode.entropy) {
                increaseEntropy(nextNode.entropy);
            }
            unlockNode(choice.nextNodeId);
            setCurrentTimeline(choice.nextNodeId);
        }
    };

    if (!gameStarted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
                <h1 className="text-6xl font-black mb-6 text-neon-purple glitch-text neon-glow">ECHOES</h1>
                <p className="text-xl text-gray-400 mb-8 max-w-md">
                    Navigate the fragmented reality. Manage your memories. Survive the entropy.
                </p>
                <Button 
                    onClick={startGame}
                    className="text-xl px-12 py-8 bg-neon-purple hover:bg-neon-pink text-white rounded-none border border-white/20 shadow-neon transition-all hover:scale-105"
                >
                    INITIALIZE SEQUENCE
                </Button>
            </div>
        );
    }
    
    if (isGameOver) {
         return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center bg-black p-4 z-50 relative">
                <h1 className="text-6xl font-black mb-6 text-red-600 glitch-text">SIGNAL LOST</h1>
                <p className="text-xl text-gray-400 mb-8">
                    Entropy has consumed this timeline.
                </p>
                <Button 
                    onClick={resetGame}
                    variant="outline"
                    className="text-lg px-8 py-4 border-red-600 text-red-500 hover:bg-red-900/20"
                >
                    REBOOT SYSTEM
                </Button>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-gray-950 font-sans p-4 overflow-hidden flex flex-col">
            <VoidOverlay />
            <GenerativeAudio />

            {/* HUD */}
            <div className="relative z-10 w-full max-w-4xl mx-auto mb-8 flex justify-between items-end border-b border-white/10 pb-4">
                <div className="flex flex-col">
                    <span className="text-xs text-neon-cyan uppercase tracking-widest mb-1">Memories</span>
                    <span className="text-4xl font-mono text-white shadow-neon">{Math.floor(memories)}</span>
                </div>
                
                <div className="flex flex-col w-1/2">
                    <span className="text-xs text-neon-pink uppercase tracking-widest mb-1 text-right">Entropy Level</span>
                    <div className="h-4 bg-gray-900 rounded-full overflow-hidden border border-gray-800 relative">
                        <div 
                            className="h-full bg-gradient-to-r from-neon-purple to-neon-red transition-all duration-1000 ease-linear"
                            style={{ width: `${entropy}%` }}
                        />
                         {/* Danger Scanline */}
                        <div className="absolute top-0 bottom-0 w-1 bg-white/50 animate-ping" style={{left: `${entropy}%`}} />
                    </div>
                </div>
            </div>

            {/* Main Stage */}
            <div className="relative z-10 flex-1 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    {currentNode ? (
                        <NodeCard 
                            key={currentNode.id} 
                            node={currentNode} 
                            onChoice={handleChoice} 
                        />
                    ) : (
                        <div className="text-red-500">ERROR: Node not found ({currentTimeline})</div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="relative z-10 text-center text-xs text-gray-600 mt-8">
                TIMELINE: {currentTimeline.toUpperCase()} // FRAGMENT: {('000' + Math.floor(entropy)).slice(-3)}
            </div>
        </div>
    );
};
