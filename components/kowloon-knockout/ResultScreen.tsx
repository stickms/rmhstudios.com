'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY } from '@/lib/kowloon-knockout/game/fighters/stats';
import { networkClient } from '@/lib/kowloon-knockout/network/client';

export default function ResultScreen() {
    const {
        result, playerWins, opponentWins,
        playerHealth, opponentHealth,
        playerMaxHealth, opponentMaxHealth,
        selectedClass, opponentClass,
        isMultiplayer,
        setPhase, resetGame
    } = useGameStore();

    const handleFightAgain = () => {
        if (isMultiplayer && networkClient.connected) {
            // Stay in the room, go back to select to pick a new fighter
            networkClient.clearHandlers();
            setPhase('select');
        } else {
            if (isMultiplayer) {
                networkClient.disconnect();
                networkClient.clearHandlers();
            }
            resetGame();
            setPhase('select');
        }
    };

    const handleMainMenu = () => {
        if (isMultiplayer) {
            networkClient.disconnect();
            networkClient.clearHandlers();
        }
        resetGame();
        setPhase('menu');
    };

    const playerHpPct = Math.round((playerHealth / playerMaxHealth) * 100);
    const opponentHpPct = Math.round((opponentHealth / opponentMaxHealth) * 100);
    const playerWon = playerHealth > opponentHealth;
    const isDraw = playerHealth === opponentHealth;

    const playerDisplay = CLASS_DISPLAY[selectedClass];
    const opponentDisplay = CLASS_DISPLAY[opponentClass];

    const resultText = isDraw ? 'DRAW' : playerWon ? 'YOU WIN!' : 'YOU LOSE';
    const resultColor = isDraw ? '#ffcc00' : playerWon ? '#33ff99' : '#ff3366';
    const subText = result === 'ko'
        ? (playerWon ? 'KNOCKOUT!' : 'KNOCKED OUT!')
        : 'DECISION';

    return (
        <div className="result-container">
            <motion.div
                className="result-content"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
            >
                <motion.div
                    className="ko-flash"
                    initial={{ opacity: 0.8 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.5 }}
                    style={{ backgroundColor: resultColor }}
                />

                <motion.h1
                    className="result-title"
                    style={{ color: resultColor, textShadow: `0 0 30px ${resultColor}` }}
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5, type: 'spring' }}
                >
                    {resultText}
                </motion.h1>

                <motion.div
                    className="result-sub"
                    style={{ color: resultColor }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                >
                    {subText}
                </motion.div>

                <motion.div
                    className="result-stats"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                >
                    <div className="result-fighter">
                        <div className="result-fighter-name" style={{ color: playerDisplay.color }}>
                            {playerDisplay.name}
                        </div>
                        <div className="result-hp" style={{ color: playerDisplay.color }}>
                            {playerHpPct}% HP
                        </div>
                    </div>

                    <div className="result-vs">VS</div>

                    <div className="result-fighter">
                        <div className="result-fighter-name" style={{ color: opponentDisplay.color }}>
                            {opponentDisplay.name}
                        </div>
                        <div className="result-hp" style={{ color: opponentDisplay.color }}>
                            {opponentHpPct}% HP
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    className="result-actions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                >
                    <motion.button
                        className="neon-button neon-button-fight"
                        onClick={handleFightAgain}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        FIGHT AGAIN
                    </motion.button>
                    <button
                        className="neon-button neon-button-back"
                        onClick={handleMainMenu}
                    >
                        MAIN MENU
                    </button>
                </motion.div>
            </motion.div>
        </div>
    );
}
