import type { ComponentType } from 'react';
import type { PuzzleType } from '@/lib/forest-explorer/types';
import { RuneSequencePuzzle } from './RuneSequencePuzzle';
import { ConstellationPuzzle } from './ConstellationPuzzle';
import { ShadowMatchPuzzle } from './ShadowMatchPuzzle';
import { WardSealPuzzle } from './WardSealPuzzle';
import { SoundPipePuzzle } from './SoundPipePuzzle';
import { ReflectionPuzzle } from './ReflectionPuzzle';
import { MemoryEchoPuzzle } from './MemoryEchoPuzzle';
import { RootNetworkPuzzle } from './RootNetworkPuzzle';
import { CorruptedGlyphPuzzle } from './CorruptedGlyphPuzzle';

export interface PuzzleComponentProps {
    config: Record<string, unknown>;
    onSolve: () => void;
    onAttempt: () => void;
}

export const PuzzleRegistry: Record<PuzzleType, ComponentType<PuzzleComponentProps>> = {
    rune_sequence: RuneSequencePuzzle,
    constellation: ConstellationPuzzle,
    shadow_match: ShadowMatchPuzzle,
    ward_seal: WardSealPuzzle,
    sound_pipe: SoundPipePuzzle,
    reflection: ReflectionPuzzle,
    memory_echo: MemoryEchoPuzzle,
    root_network: RootNetworkPuzzle,
    corrupted_glyph: CorruptedGlyphPuzzle,
};
