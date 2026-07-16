'use client';

import { useEffect, useCallback, lazy, Suspense } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { CLASS_DISPLAY, CLASS_STATS, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';

const FighterPreview3D = lazy(() => import('@/components/kowloon-knockout/arena/FighterPreview3D'));

const DIFFICULTIES: { label: string; value: number }[] = [
    { label: 'EASY', value: 0.35 },
    { label: 'MEDIUM', value: 0.55 },
    { label: 'HARD', value: 0.8 },
];

export default function CharacterSelect() {
    const { t } = useTranslation('c-kowloon-knockout');
    const {
        selectedClass, setSelectedClass, isMultiplayer, resetMultiplayer, setPhase,
        mode, setMode, playerCount, setPlayerCount, aiDifficulty, setAiDifficulty,
        startLocalMatch,
    } = useGameStore();

    const selectedIdx = ALL_FIGHTERS.indexOf(selectedClass);

    const navigate = useCallback((dir: -1 | 1) => {
        const newIdx = (selectedIdx + dir + ALL_FIGHTERS.length) % ALL_FIGHTERS.length;
        setSelectedClass(ALL_FIGHTERS[newIdx]);
    }, [selectedIdx, setSelectedClass]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') navigate(-1);
            if (e.key === 'ArrowRight') navigate(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navigate]);

    // Teams need an even number of fighters.
    useEffect(() => {
        if (mode === 'teams' && playerCount % 2 !== 0) setMode('ffa');
    }, [mode, playerCount, setMode]);

    const handleFight = () => {
        if (isMultiplayer) setPhase('lobby');
        else startLocalMatch();
    };

    const handleBack = () => {
        resetMultiplayer();
        setPhase('menu');
    };

    const display = CLASS_DISPLAY[selectedClass];
    const stats = CLASS_STATS[selectedClass];

    return (
        <div className="select-container">
            <motion.div className="select-step" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <h1 className="select-title">{t('choose-fighter', { defaultValue: 'CHOOSE YOUR FIGHTER' })}</h1>

                <div className="fighter-carousel">
                    <button className="carousel-arrow carousel-arrow-left" onClick={() => navigate(-1)}>◀</button>

                    <div className="carousel-center">
                        <div className="roster-strip">
                            {ALL_FIGHTERS.map((cls) => {
                                const d = CLASS_DISPLAY[cls];
                                const isSelected = selectedClass === cls;
                                return (
                                    <motion.div
                                        key={cls}
                                        className={`roster-slot ${isSelected ? 'roster-slot-selected' : ''}`}
                                        style={{
                                            borderColor: isSelected ? d.color : '#333',
                                            background: `radial-gradient(circle at 50% 35%, ${d.color}40, #0a0a14)`,
                                            boxShadow: isSelected ? `0 0 14px ${d.color}80` : 'none',
                                        }}
                                        onClick={() => setSelectedClass(cls)}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <span style={{ color: d.accent, fontSize: 8, textShadow: `0 0 6px ${d.color}` }}>
                                            {d.name.split(' ').map((w) => w[0]).join('')}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={selectedClass}
                                className="fighter-detail"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="fighter-detail-sprite" style={{ filter: 'contrast(1.1)' }}>
                                    <Suspense fallback={<div style={{ width: 200, height: 200 }} />}>
                                        <FighterPreview3D fighterClass={selectedClass} size={200} />
                                    </Suspense>
                                </div>
                                <div className="fighter-detail-info">
                                    <h2 className="fighter-name" style={{ color: display.color, textShadow: `0 0 10px ${display.color}80` }}>
                                        {display.name}
                                    </h2>
                                    <p className="fighter-desc">{display.description}</p>
                                    <div className="stat-bars">
                                        <StatBar label="HEALTH" value={stats.maxHealth} max={130} color={display.color} />
                                        <StatBar label="POWER" value={(stats.power * 100) / 1.8} max={100} color={display.color} />
                                        <StatBar label="SPEED" value={(stats.moveSpeed * 100) / 2.5} max={100} color={display.color} />
                                        <StatBar label="DEFENSE" value={(stats.defense * 100) / 1.4} max={100} color={display.color} />
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <button className="carousel-arrow carousel-arrow-right" onClick={() => navigate(1)}>▶</button>
                </div>

                {!isMultiplayer && (
                    <div className="match-options">
                        <OptionRow label={t('fighters', { defaultValue: 'FIGHTERS' })}>
                            {[2, 3, 4].map((n) => (
                                <OptionChip key={n} active={playerCount === n} onClick={() => setPlayerCount(n)}>{n}</OptionChip>
                            ))}
                        </OptionRow>
                        <OptionRow label={t('mode', { defaultValue: 'MODE' })}>
                            <OptionChip active={mode === 'ffa'} onClick={() => setMode('ffa')}>{t('ffa', { defaultValue: 'FREE-FOR-ALL' })}</OptionChip>
                            <OptionChip active={mode === 'teams'} disabled={playerCount % 2 !== 0} onClick={() => setMode('teams')}>{t('teams', { defaultValue: 'TEAMS' })}</OptionChip>
                        </OptionRow>
                        <OptionRow label={t('cpu', { defaultValue: 'CPU' })}>
                            {DIFFICULTIES.map((d) => (
                                <OptionChip key={d.label} active={Math.abs(aiDifficulty - d.value) < 0.01} onClick={() => setAiDifficulty(d.value)}>
                                    {t(d.label.toLowerCase(), { defaultValue: d.label })}
                                </OptionChip>
                            ))}
                        </OptionRow>
                    </div>
                )}

                <div className="select-actions">
                    <button className="neon-button neon-button-back" onClick={handleBack}>{t('back', { defaultValue: 'BACK' })}</button>
                    <motion.button
                        className="neon-button neon-button-fight fight-button-large"
                        onClick={handleFight}
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    >
                        {isMultiplayer ? t('next', { defaultValue: 'NEXT' }) : t('fight-bang', { defaultValue: 'FIGHT!' })}
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="option-row">
            <span className="option-label">{label}</span>
            <div className="option-chips">{children}</div>
        </div>
    );
}

function OptionChip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            className={`option-chip ${active ? 'option-chip-active' : ''}`}
            disabled={disabled}
            onClick={onClick}
            style={{ opacity: disabled ? 0.35 : 1 }}
        >
            {children}
        </button>
    );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className="stat-bar">
            <span className="stat-label">{label}</span>
            <div className="stat-track">
                <motion.div
                    className="stat-fill"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }}
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}
