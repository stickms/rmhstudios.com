'use client';

import { useEffect } from 'react';
import { PointerLockControls } from '@react-three/drei';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { InteractionSystem } from './InteractionSystem';
import { StoryPlayer } from './StoryPlayerController';
import { ActOneScene } from './acts/ActOneScene';
import { ActTwoScene } from './acts/ActTwoScene';
import { ActThreeScene } from './acts/ActThreeScene';
import { useFrame } from '@react-three/fiber';

export function StoryScene({
    onLock,
    onUnlock,
}: {
    onLock: () => void;
    onUnlock: () => void;
}) {
    const currentAct = useStoryStore(s => s.currentAct);
    const tickPlaytime = useStoryStore(s => s.tickPlaytime);
    const showPuzzleOverlay = useStoryStore(s => s.showPuzzleOverlay);
    const journalOpen = useStoryStore(s => s.journalOpen);

    // Any overlay that should free the mouse
    const overlayActive = showPuzzleOverlay || journalOpen;

    // Exit pointer lock whenever an overlay opens
    // (Re-lock is handled by the overlay close handlers directly, within the user gesture)
    useEffect(() => {
        if (overlayActive && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }, [overlayActive]);

    // Tick playtime every frame
    useFrame((_, delta) => {
        tickPlaytime(delta);
    });

    return (
        <>
            {/* Act-specific scene */}
            {currentAct === 'act1' && <ActOneScene />}
            {currentAct === 'act2' && <ActTwoScene />}
            {currentAct === 'act3' && <ActThreeScene />}

            {/* Interaction system (flashlight reveal + proximity detection) */}
            <InteractionSystem />

            {/* Player controller with story mode keys */}
            <StoryPlayer />

            {/* Pointer lock — only mount when no overlay is active.
                Unmounting removes the click-to-lock handler so clicks on
                puzzle/journal UI don't re-capture the pointer. */}
            {!overlayActive && (
                <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
            )}
        </>
    );
}
