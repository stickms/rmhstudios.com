"use client";

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { GameInfo } from '@/lib/games';
import { cn } from '@/lib/utils';

interface GameCardProps {
    game: GameInfo;
}

export function GameCard({ game }: GameCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [popoverDirection, setPopoverDirection] = useState<'right' | 'left' | 'bottom' | 'top'>('right');
    const [popoverAlign, setPopoverAlign] = useState<'start' | 'center' | 'end'>('center');
    const cardRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        if (cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            const spaceBelow = windowHeight - rect.bottom;
            const spaceAbove = rect.top;
            const minVerticalSpace = 320;

            if (windowWidth < 1024) {
                if (spaceBelow < minVerticalSpace && spaceAbove > spaceBelow) {
                    setPopoverDirection('top');
                } else {
                    setPopoverDirection('bottom');
                }

                const popoverWidth = Math.min(windowWidth * 0.85, 320);
                const halfPopover = popoverWidth / 2;
                const cardCenter = rect.left + rect.width / 2;

                if (cardCenter - halfPopover < 10) {
                    setPopoverAlign('start');
                } else if (cardCenter + halfPopover > windowWidth - 10) {
                    setPopoverAlign('end');
                } else {
                    setPopoverAlign('center');
                }
            } else {
                const spaceOnRight = windowWidth - rect.right;
                const spaceOnLeft = rect.left;
                const minSpaceNeeded = 350;

                if (spaceOnRight < minSpaceNeeded && spaceOnLeft > minSpaceNeeded) {
                    setPopoverDirection('left');
                } else {
                    setPopoverDirection('right');
                }
                setPopoverAlign('center');
            }
        }
        setIsHovered(true);
    };

    return (
        <div
            className={cn("relative group", isHovered && "z-100")}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Link href={game.href}>
                <motion.div
                    ref={cardRef}
                    data-slot="card"
                    className="relative aspect-2/3 overflow-hidden border border-site-border bg-site-surface shadow-lg transition-all group-hover:border-site-accent/50"
                    style={{
                        borderRadius: "var(--site-radius)",
                        borderWidth: "var(--site-border-width)",
                        transitionDuration: "var(--site-transition-speed)",
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
                        <div className={cn("w-full h-full flex items-center justify-center bg-linear-to-br", game.gradient)}>
                            <span className="text-2xl font-bold text-white text-center px-4">{game.title}</span>
                        </div>
                    )}

                    {/* Bottom gradient overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/40 to-transparent pointer-events-none" />
                </motion.div>
            </Link>

            {/* Hover Popover */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        key="game-popover"
                        initial={{
                            opacity: 0,
                            x: popoverDirection === 'right' ? 10 : popoverDirection === 'left' ? -10 : 0,
                            y: popoverDirection === 'bottom' ? 10 : popoverDirection === 'top' ? -10 : 0,
                            scale: 0.95
                        }}
                        animate={{
                            opacity: 1,
                            x: popoverDirection === 'right' ? 20 : popoverDirection === 'left' ? -20 : 0,
                            y: popoverDirection === 'bottom' ? 20 : popoverDirection === 'top' ? -20 : 0,
                            scale: 1
                        }}
                        exit={{
                            opacity: 0,
                            x: popoverDirection === 'right' ? 10 : popoverDirection === 'left' ? -10 : 0,
                            y: popoverDirection === 'bottom' ? 10 : popoverDirection === 'top' ? -10 : 0,
                            scale: 0.95
                        }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                            "absolute z-110 w-[85vw] sm:w-80 pointer-events-none",
                            popoverDirection === 'right' && "left-full top-0 ml-4",
                            popoverDirection === 'left' && "right-full top-0 mr-4",
                            popoverDirection === 'bottom' && cn(
                                "top-full mt-4",
                                popoverAlign === 'center' && "left-1/2 -translate-x-1/2",
                                popoverAlign === 'start' && "left-0",
                                popoverAlign === 'end' && "right-0"
                            ),
                            popoverDirection === 'top' && cn(
                                "bottom-full mb-4",
                                popoverAlign === 'center' && "left-1/2 -translate-x-1/2",
                                popoverAlign === 'start' && "left-0",
                                popoverAlign === 'end' && "right-0"
                            )
                        )}
                    >
                        <div className="bg-site-surface/95 backdrop-blur-md border border-site-border rounded-xl p-6 shadow-2xl relative">
                            {/* Decorative pointer/arrow */}
                            <div className={cn(
                                "absolute w-4 h-4 bg-site-surface border-site-border rotate-45",
                                popoverDirection === 'right' && "top-8 -left-2 border-l border-b",
                                popoverDirection === 'left' && "top-8 -right-2 border-r border-t",
                                popoverDirection === 'bottom' && cn(
                                    "-top-2 border-l border-t",
                                    popoverAlign === 'center' && "left-1/2 -translate-x-1/2",
                                    popoverAlign === 'start' && "left-8",
                                    popoverAlign === 'end' && "right-8"
                                ),
                                popoverDirection === 'top' && cn(
                                    "-bottom-2 border-r border-b",
                                    popoverAlign === 'center' && "left-1/2 -translate-x-1/2",
                                    popoverAlign === 'start' && "left-8",
                                    popoverAlign === 'end' && "right-8"
                                )
                            )} />

                            <div className="relative space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-xl font-bold text-site-text">{game.title}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {game.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-site-bg border border-site-border text-site-text-dim">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-px bg-site-border" />

                                <p className="text-site-text-muted text-sm leading-relaxed">
                                    {game.description}
                                </p>

                                {game.longDescription && (
                                    <p className="text-site-text-dim text-xs italic line-clamp-3">
                                        {game.longDescription}
                                    </p>
                                )}

                                <div className="pt-2 flex items-center justify-between text-xs font-mono">
                                    <span className="text-site-text-dim uppercase">{game.status}</span>
                                    <span className="text-site-accent font-bold uppercase">{game.cta}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
