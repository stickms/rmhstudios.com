"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { GameInfo } from '@/lib/games';
import { cn } from '@/lib/utils';

interface GameCardProps {
    game: GameInfo;
}

export function GameCard({ game }: GameCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [popoverDirection, setPopoverDirection] = useState<'right' | 'left'>('right');
    const cardRef = useRef<HTMLDivElement>(null);
    
    // Mouse tracking for glossy effect
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Smooth the mouse movement
    const springConfig = { stiffness: 100, damping: 25 };
    const smoothedX = useSpring(mouseX, springConfig);
    const smoothedY = useSpring(mouseY, springConfig);

    // Subtle tilt effect
    const rotateX = useTransform(smoothedY, [-0.5, 0.5], [5, -5]);
    const rotateY = useTransform(smoothedX, [-0.5, 0.5], [-5, 5]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!cardRef.current) return;
            
            const rect = cardRef.current.getBoundingClientRect();
            // Calculate mouse position relative to card center
            // Larger divisor = slower movement of light (stays on card longer)
            const x = (e.clientX - (rect.left + rect.width / 2)) / 800; 
            const y = (e.clientY - (rect.top + rect.height / 2)) / 800;
            
            // Limit the tilt/shine impact when far away
            // But don't clamp too tight so the light can reach edges
            const boundedX = Math.max(-1.5, Math.min(1.5, x));
            const boundedY = Math.max(-1.5, Math.min(1.5, y));
            
            mouseX.set(boundedX);
            mouseY.set(boundedY);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
    }, [mouseX, mouseY]);

    const handleMouseEnter = () => {
        if (cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            const spaceOnRight = window.innerWidth - rect.right;
            // If less than 350px (w-80 + some margin), flip to left
            setPopoverDirection(spaceOnRight < 350 ? 'left' : 'right');
        }
        setIsHovered(true);
    };

    return (
        <div className="relative group">
            <Link href={game.href}>
                <motion.div
                    ref={cardRef}
                    className="relative aspect-[2/3] rounded-lg overflow-hidden border border-slate-800 bg-slate-900 shadow-xl transition-all duration-300 group-hover:border-slate-500/50 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={() => setIsHovered(false)}
                    style={{
                        rotateX,
                        rotateY,
                        transformStyle: "preserve-3d",
                        perspective: 1000,
                    }}
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    {game.imagePath ? (
                        <Image
                            src={game.imagePath}
                            alt={game.title}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                        />
                    ) : (
                        <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", game.gradient)}>
                            <span className="text-2xl font-bold text-white text-center px-4">{game.title}</span>
                        </div>
                    )}
                    
                    {/* Glossy/Shine Overlay */}
                    <motion.div 
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            opacity: useTransform(
                                [smoothedX, smoothedY],
                                ([x, y]) => {
                                    const dist = Math.sqrt((x as number)**2 + (y as number)**2);
                                    // Fade out sheen when mouse is very far
                                    return Math.max(0.1, 1 - dist * 0.5);
                                }
                            ),
                            background: useTransform(
                                [smoothedX, smoothedY],
                                ([x, y]) => {
                                    // Map [-1.5, 1.5] to [0, 100]%
                                    const posX = ((x as number + 1.5) / 3) * 100;
                                    const posY = ((y as number + 1.5) / 3) * 100;
                                    return `radial-gradient(circle at ${posX}% ${posY}%, rgba(255,255,255,0.4) 0%, transparent 80%)`;
                                }
                            )
                        }}
                    />

                    {/* Subtle border shine */}
                    <motion.div 
                        className="absolute inset-0 border border-white/20 rounded-lg pointer-events-none"
                        style={{
                            opacity: useTransform(
                                [smoothedX, smoothedY],
                                ([x, y]) => {
                                    const dist = Math.sqrt((x as number)**2 + (y as number)**2);
                                    return Math.max(0.2, 0.8 - dist * 0.4);
                                }
                            ),
                            background: useTransform(
                                [smoothedX, smoothedY],
                                ([x, y]) => `linear-gradient(${Math.atan2(y as number, x as number) * (180 / Math.PI)}deg, rgba(255,255,255,0.2) 0%, transparent 50%)`
                            )
                        }}
                    />
                </motion.div>
            </Link>

            {/* Hover Popover */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ 
                            opacity: 0, 
                            x: popoverDirection === 'right' ? 10 : -10, 
                            scale: 0.95 
                        }}
                        animate={{ 
                            opacity: 1, 
                            x: popoverDirection === 'right' ? 20 : -20, 
                            scale: 1 
                        }}
                        exit={{ 
                            opacity: 0, 
                            x: popoverDirection === 'right' ? 10 : -10, 
                            scale: 0.95 
                        }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                            "absolute top-0 z-50 hidden lg:block w-80 pointer-events-none",
                            popoverDirection === 'right' ? "left-full ml-4" : "right-full mr-4"
                        )}
                    >
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-6 shadow-2xl relative">
                            {/* Decorative pointer/arrow */}
                            <div className={cn(
                                "absolute top-8 w-4 h-4 bg-slate-900 border-slate-700 rotate-45",
                                popoverDirection === 'right' 
                                    ? "-left-2 border-l border-b" 
                                    : "-right-2 border-r border-t"
                            )} />
                            
                            <div className="relative space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-xl font-bold text-white">{game.title}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {game.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="h-px bg-slate-800" />
                                
                                <p className="text-slate-300 text-sm leading-relaxed">
                                    {game.description}
                                </p>
                                
                                {game.longDescription && (
                                    <p className="text-slate-500 text-xs italic line-clamp-3">
                                        {game.longDescription}
                                    </p>
                                )}
                                
                                <div className="pt-2 flex items-center justify-between text-xs font-mono">
                                    <span className="text-slate-500 uppercase">{game.status}</span>
                                    <span className="text-cyan-400 font-bold uppercase">{game.cta}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
