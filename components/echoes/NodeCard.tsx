import { motion } from 'framer-motion';
import { StoryNode, Choice, GameActions } from '@/lib/echoes/types'; // Updated import
import { useEchoesStore } from '@/lib/store/useEchoesStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { CipherPuzzle } from './puzzles/CipherPuzzle';
import { SequencePuzzle } from './puzzles/SequencePuzzle';

interface NodeCardProps {
    node: StoryNode;
    onChoice: (choice: Choice) => void;
}

export const NodeCard = ({ node, onChoice }: NodeCardProps) => {
    const { memories, addMemories } = useEchoesStore();
    const [displayedContent, setDisplayedContent] = useState('');
    const [puzzleSolved, setPuzzleSolved] = useState(false);
    
    useEffect(() => {
        setDisplayedContent('');
        setPuzzleSolved(false); // Reset on new node
        let i = 0;
        const interval = setInterval(() => {
            setDisplayedContent(node.content.slice(0, i));
            i++;
            if (i > node.content.length) clearInterval(interval);
        }, 20); // Typing speed
        
        return () => clearInterval(interval);
    }, [node.id, node.content]);

    const handlePuzzleComplete = () => {
        setPuzzleSolved(true);
        if (node.puzzleConfig?.reward) {
             addMemories(node.puzzleConfig.reward);
        }
    };
    
    // Determine if choices are locked behind a puzzle
    const choicesLocked = node.type === 'puzzle' && !puzzleSolved;

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-2xl mx-auto backdrop-blur-md bg-black/60 border border-neon-purple/50 rounded-xl p-6 shadow-neon relative overflow-hidden"
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4">
                <h2 className="text-2xl font-bold text-neon-cyan glitch-text" data-text={node.title}>
                    {node.title}
                </h2>
                <div className="text-xs font-mono text-neon-glow uppercase tracking-widest border border-neon-glow px-2 py-1 rounded">
                    Type: {node.type}
                </div>
            </div>

            {/* Content */}
            <div className="mb-8 min-h-[100px] text-lg leading-relaxed text-gray-200">
                {displayedContent}
                <span className="animate-pulse inline-block w-2 h-5 bg-neon-cyan ml-1 align-middle"/>
            </div>

            {/* Puzzle Area */}
            {node.type === 'puzzle' && node.puzzleConfig && !puzzleSolved && (
                <div className="mb-8 p-6 bg-black/40 border border-neon-cyan/30 rounded-lg">
                    {node.puzzleConfig.type === 'cipher' && (
                        <CipherPuzzle 
                            targetWord={node.puzzleConfig.data.word} 
                            onComplete={handlePuzzleComplete} 
                        />
                    )}
                    {node.puzzleConfig.type === 'sequence' && (
                        <SequencePuzzle 
                            sequence={node.puzzleConfig.data.sequence} 
                            onComplete={handlePuzzleComplete} 
                        />
                    )}
                </div>
            )}
            
            {puzzleSolved && node.type === 'puzzle' && (
                <div className="mb-6 text-center text-neon-green font-mono animate-pulse">
                    PUZZLE SOLVED. MEMORY RESTORED.
                </div>
            )}

            {/* Choices */}
            <div className="space-y-3">
                {choicesLocked ? (
                    <div className="text-center text-gray-500 italic">
                        Solve the puzzle to proceed...
                    </div>
                ) : node.choices.length > 0 ? (
                    node.choices.map((choice) => {
                        const canAfford = (choice.cost || 0) <= memories;
                        return (
                            <Button
                                key={choice.id}
                                onClick={() => canAfford && onChoice(choice)}
                                disabled={!canAfford}
                                className={cn(
                                    "w-full justify-between h-auto py-4 text-left group relative overflow-hidden transition-all duration-300",
                                    canAfford 
                                        ? "hover:border-neon-pink hover:shadow-[0_0_15px_rgba(255,0,255,0.4)]" 
                                        : "opacity-50 cursor-not-allowed grayscale"
                                )}
                                variant="outline"
                            >
                                <span className="relative z-10 group-hover:pl-2 transition-all duration-300">
                                    {choice.text}
                                </span>
                                {choice.cost ? (
                                    <span className={cn(
                                        "text-xs font-mono px-2 py-1 rounded",
                                        canAfford ? "bg-neon-purple/20 text-neon-purple" : "bg-red-900/20 text-red-500"
                                    )}>
                                        -{choice.cost} Mem
                                    </span>
                                ) : null}
                                
                                {/* Hover Effect Background */}
                                <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/0 via-neon-purple/10 to-neon-purple/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                            </Button>
                        );
                    })
                ) : (
                    <div className="text-center text-red-500 font-mono animate-pulse">
                        TERMINAL NODE. TIMELINE ENDED.
                    </div>
                )}
            </div>
            
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-neon-purple/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-20 h-20 bg-neon-cyan/20 blur-3xl pointer-events-none" />
        </motion.div>
    );
};
