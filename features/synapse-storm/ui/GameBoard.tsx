import React from 'react';
import { useTranslation } from 'react-i18next';
import { GameState } from '../engine/types';
import { HUD } from './HUD';
import { PuzzleCard } from './PuzzleCard';
import { useSynapseAssist } from './assist-context';
import { EndRunButton, useCappedScreenColor } from './assist-ui';

interface GameBoardProps {
  state: GameState;
  onSolve: (id: string, correct: boolean) => void;
  onSkipPhase?: (id: string) => void;
  /** Assist: the run has no timers, so the player ends it. */
  onEndRun?: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({ state, onSolve, onSkipPhase, onEndRun }) => {
  const { t } = useTranslation('c-synapse-storm');
  const assist = useSynapseAssist();
  const saturated = useCappedScreenColor(Boolean(state.isSaturated), assist);
  return (
    <div className={`game-board ${saturated ? 'saturated' : ''}`}>
      <HUD state={state} />

      <div className="playfield" data-jelly-zone="playfield">
        {state.activePuzzles.length === 0 && (
          <div className="playfield-empty">
            <span className="loading-pulse">🌩️</span>
            <p>
              {t('preparing-sequence', {
                defaultValue: 'Preparing sequence...',
              })}
            </p>
          </div>
        )}

        <div className="playfield-grid">
          {state.activePuzzles.map((puzzle) => (
            <PuzzleCard key={puzzle.id} puzzle={puzzle} gameState={state} onSolve={onSolve} onSkipPhase={onSkipPhase} />
          ))}
        </div>

        {assist.frozenTimers && onEndRun && <EndRunButton onEndRun={onEndRun} />}

        {state.combo >= 10 && (
          <div className="combo-overlay">
            <span className="combo-text">
              {t('combo-count', {
                defaultValue: '{{combo}} COMBO!',
                combo: state.combo,
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
