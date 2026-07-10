'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient } from '@/lib/kowloon-knockout/net/client';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';

export default function ResultScreen() {
    const { t } = useTranslation('c-kowloon-knockout');
    const { matchResult, isMultiplayer, setPhase, resetGame } = useGameStore();

    const handleFightAgain = () => {
        if (isMultiplayer && networkClient.connected) {
            // Ask the server to return the WHOLE room to the lobby; the shared
            // lobby_update broadcast pulls every player back together.
            networkClient.returnToLobby();
        } else {
            if (isMultiplayer) networkClient.disconnect();
            resetGame();
            setPhase('select');
        }
    };

    const handleMainMenu = () => {
        if (isMultiplayer) networkClient.disconnect();
        resetGame();
        setPhase('menu');
    };

    if (!matchResult) {
        return (
            <div className="result-container">
                <button className="neon-button neon-button-back" onClick={handleMainMenu}>{t('main-menu', { defaultValue: 'MAIN MENU' })}</button>
            </div>
        );
    }

    const { winnerSeat, mode, fighters } = matchResult;
    const local = fighters.find((f) => f.isLocal);
    const localWon = local
        ? (mode === 'teams' ? local.team === winnerSeat : local.seat === winnerSeat)
        : false;

    const winnerName = mode === 'teams'
        ? `${t('team', { defaultValue: 'TEAM' })} ${String.fromCharCode(65 + (winnerSeat ?? 0))}`
        : fighters.find((f) => f.seat === winnerSeat)?.name ?? t('draw', { defaultValue: 'DRAW' });

    const resultText = winnerSeat === null
        ? t('draw', { defaultValue: 'DRAW' })
        : local
            ? (localWon ? t('you-win', { defaultValue: 'YOU WIN!' }) : t('you-lose', { defaultValue: 'YOU LOSE' }))
            : `${winnerName} ${t('wins', { defaultValue: 'WINS' })}`;
    const resultColor = winnerSeat === null ? '#ffcc00' : localWon ? '#33ff99' : '#ff3366';

    const ranked = [...fighters].sort((a, b) => b.roundWins - a.roundWins || b.health - a.health);

    return (
        <div className="result-container">
            <motion.div className="result-content" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
                <motion.div className="ko-flash" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 1.5 }} style={{ backgroundColor: resultColor }} />

                <motion.h1
                    className="result-title"
                    style={{ color: resultColor, textShadow: `0 0 30px ${resultColor}` }}
                    initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.5, type: 'spring' }}
                >
                    {resultText}
                </motion.h1>

                <motion.div className="result-sub" style={{ color: resultColor }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                    {winnerSeat !== null && t('champion', { defaultValue: 'CHAMPION: {{name}}', name: winnerName })}
                </motion.div>

                <motion.div className="result-scoreboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                    {ranked.map((f, i) => {
                        const teamColor = mode === 'teams' ? TEAM_COLORS[f.team] ?? f.color : f.color;
                        return (
                            <div key={f.seat} className="result-row" style={{ borderColor: `${teamColor}50` }}>
                                <span className="result-rank">{i + 1}</span>
                                <span style={{ color: f.color, flex: 1, textAlign: 'left' }}>{f.name}{f.isLocal ? ' ◀' : ''}</span>
                                {mode === 'teams' && <span style={{ color: teamColor, fontSize: 7 }}>{String.fromCharCode(65 + f.team)}</span>}
                                <span style={{ color: '#ffcc00' }}>{'●'.repeat(f.roundWins)}</span>
                                <span style={{ color: f.health > 0 ? '#33ff99' : '#ff3366', minWidth: 44, textAlign: 'right' }}>
                                    {Math.round((f.health / f.maxHealth) * 100)}%
                                </span>
                            </div>
                        );
                    })}
                </motion.div>

                <motion.div className="result-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
                    <motion.button className="neon-button neon-button-fight" onClick={handleFightAgain} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        {isMultiplayer ? t('back-to-lobby', { defaultValue: 'BACK TO LOBBY' }) : t('fight-again', { defaultValue: 'FIGHT AGAIN' })}
                    </motion.button>
                    <button className="neon-button neon-button-back" onClick={handleMainMenu}>{t('main-menu', { defaultValue: 'MAIN MENU' })}</button>
                </motion.div>
            </motion.div>
        </div>
    );
}
