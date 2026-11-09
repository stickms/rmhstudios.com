import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient } from '@/lib/kowloon-knockout/net/client';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';
import './kk-screens.css';

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
            <div className="kk-screen kk-result">
                <button type="button" className="neon-button neon-button-back" onClick={handleMainMenu}>{t('main-menu', { defaultValue: 'MAIN MENU' })}</button>
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
    const tone = winnerSeat === null ? 'draw' : localWon ? 'win' : 'lose';
    const flashColor = tone === 'win' ? '#2cff9a' : tone === 'lose' ? '#ff2e88' : '#ffc400';

    const ranked = [...fighters].sort((a, b) => b.roundWins - a.roundWins || b.health - a.health);

    return (
        <div className={`kk-screen kk-result kk-result--${tone}`}>
            <motion.div className="ko-flash" aria-hidden="true" initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 1.5 }} style={{ backgroundColor: flashColor }} />

            <motion.div className="kk-result__banner" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
                <span className="kk-ticket" aria-hidden="true">REEL 07 · FINAL FRAME</span>
                <motion.h1
                    className="result-title"
                    initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.45, type: 'spring' }}
                >
                    {resultText}
                </motion.h1>
                {winnerSeat !== null && (
                    <motion.div className="result-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                        {t('champion', { defaultValue: 'CHAMPION: {{name}}', name: winnerName })}
                    </motion.div>
                )}
            </motion.div>

            <motion.ol className="result-scoreboard" style={{ listStyle: 'none', margin: 0, padding: 0 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
                {ranked.map((f, i) => {
                    const teamColor = mode === 'teams' ? TEAM_COLORS[f.team] ?? f.color : f.color;
                    return (
                        <li key={f.seat} className="result-row" style={{ '--seat': f.color } as React.CSSProperties}>
                            <span className="result-rank">{i + 1}</span>
                            <span className="kk-row-name">{f.name}{f.isLocal ? ' ◀' : ''}</span>
                            {mode === 'teams' && <span className="kk-row-team" style={{ color: teamColor }}>{String.fromCharCode(65 + f.team)}</span>}
                            <span className="kk-row-wins" aria-label={`${f.roundWins}`}>{'●'.repeat(f.roundWins)}</span>
                            <span className={`kk-row-hp ${f.health > 0 ? 'kk-row-hp--alive' : 'kk-row-hp--down'}`}>
                                {Math.round((f.health / f.maxHealth) * 100)}%
                            </span>
                        </li>
                    );
                })}
            </motion.ol>

            <motion.div className="kk-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
                <button type="button" className="neon-button neon-button-back" onClick={handleMainMenu}>{t('main-menu', { defaultValue: 'MAIN MENU' })}</button>
                <button type="button" className="neon-button neon-button-fight fight-button-large" onClick={handleFightAgain}>
                    {isMultiplayer ? t('back-to-lobby', { defaultValue: 'BACK TO LOBBY' }) : t('fight-again', { defaultValue: 'FIGHT AGAIN' })}
                </button>
            </motion.div>
        </div>
    );
}
