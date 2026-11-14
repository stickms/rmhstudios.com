import { useEffect, useCallback, lazy } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore, restoreStoredModel } from '@/lib/kowloon-knockout/store';
import ModelPicker from '@/components/kowloon-knockout/ModelPicker';
import './kk-screens.css';
import { CLASS_DISPLAY, CLASS_STATS, ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { ArrivalSuspense } from '@/components/ui/arrive';

const FighterPreview3D = lazy(() => import('@/components/kowloon-knockout/arena/FighterPreview3D'));

const DIFFICULTIES: { label: string; value: number }[] = [
    { label: 'EASY', value: 0.35 },
    { label: 'MEDIUM', value: 0.55 },
    { label: 'HARD', value: 0.8 },
];

export default function CharacterSelect() {
    const { t } = useTranslation('c-kowloon-knockout');
    const {
        selectedClass, setSelectedClass, selectedModel, setSelectedModel, isMultiplayer, resetMultiplayer, setPhase,
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

    // Restore the remembered model once on the client (the store starts at the default so SSR matches).
    useEffect(() => { restoreStoredModel(); }, []);

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
        <div className="kk-screen kk-select">
            <motion.div className="kk-head" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <span className="kk-ticket" aria-hidden="true">REEL 07 · FRAME 19A</span>
                <h1 className="kk-title">{t('choose-fighter', { defaultValue: 'CHOOSE YOUR FIGHTER' })}</h1>
            </motion.div>

            <section
                className="kk-panel kk-select__stage"
                style={{ '--c': display.color, '--seat': display.color } as React.CSSProperties}
                aria-label={t('fighter-detail', { defaultValue: 'Selected fighter' })}
            >
                <div className="kk-stage__preview">
                    {/* No wrapper: `.kk-stage__preview > div` sizes the preview itself, which fades on its own. */}
                    <ArrivalSuspense fallback={null} wrap={false}>
                        <FighterPreview3D fighterClass={selectedClass} modelId={selectedModel} size={200} />
                    </ArrivalSuspense>
                </div>

                <div className="kk-stage__info">
                    <div className="kk-stage__nav">
                        <button
                            type="button"
                            className="carousel-arrow"
                            aria-label={t('previous-fighter', { defaultValue: 'Previous fighter' })}
                            onClick={() => navigate(-1)}
                        >◀</button>
                        <AnimatePresence mode="wait">
                            <motion.h2
                                key={selectedClass}
                                className="fighter-name"
                                style={{ color: display.accent, textShadow: `0 0 4px ${display.color}, 0 0 14px ${display.color}` }}
                                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                aria-live="polite"
                            >
                                {display.name}
                            </motion.h2>
                        </AnimatePresence>
                        <button
                            type="button"
                            className="carousel-arrow"
                            aria-label={t('next-fighter', { defaultValue: 'Next fighter' })}
                            onClick={() => navigate(1)}
                        >▶</button>
                    </div>
                    <p className="fighter-desc">{display.description}</p>
                    <div className="stat-bars">
                        <StatBar label={t('stat-health', { defaultValue: 'HEALTH' })} value={stats.maxHealth} max={130} color={display.color} />
                        <StatBar label={t('stat-power', { defaultValue: 'POWER' })} value={(stats.power * 100) / 1.8} max={100} color={display.color} />
                        <StatBar label={t('stat-speed', { defaultValue: 'SPEED' })} value={(stats.moveSpeed * 100) / 2.5} max={100} color={display.color} />
                        <StatBar label={t('stat-defense', { defaultValue: 'DEFENSE' })} value={(stats.defense * 100) / 1.4} max={100} color={display.color} />
                    </div>
                </div>
            </section>

            <ul className="roster-strip" aria-label={t('roster', { defaultValue: 'Fighter roster' })}>
                {ALL_FIGHTERS.map((cls) => {
                    const d = CLASS_DISPLAY[cls];
                    const isSelected = selectedClass === cls;
                    return (
                        <li key={cls}>
                            <button
                                type="button"
                                className={`roster-slot ${isSelected ? 'roster-slot-selected' : ''}`}
                                style={{ '--seat': d.color } as React.CSSProperties}
                                aria-pressed={isSelected}
                                aria-label={d.name}
                                onClick={() => setSelectedClass(cls)}
                            >
                                <span className="roster-slot-code" aria-hidden="true">
                                    {d.name.split(' ').map((w) => w[0]).join('')}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <ModelPicker value={selectedModel} onChange={setSelectedModel} />

            {!isMultiplayer && (
                <section className="kk-panel kk-panel--cyan match-options" aria-label={t('match-options', { defaultValue: 'Match options' })}>
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
                </section>
            )}

            <div className="kk-actions">
                <button type="button" className="neon-button neon-button-back" onClick={handleBack}>{t('back', { defaultValue: 'BACK' })}</button>
                <button type="button" className="neon-button neon-button-fight fight-button-large" onClick={handleFight}>
                    {isMultiplayer ? t('next', { defaultValue: 'NEXT' }) : t('fight-bang', { defaultValue: 'FIGHT!' })}
                </button>
            </div>
        </div>
    );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="option-row" role="group" aria-label={label}>
            <span className="option-label" aria-hidden="true">{label}</span>
            <div className="option-chips">{children}</div>
        </div>
    );
}

function OptionChip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            className={`option-chip ${active ? 'option-chip-active' : ''}`}
            disabled={disabled}
            aria-pressed={active}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** Ten neon cells: the value rounds to the nearest tenth and the fill is clipped, not resized,
 *  so the cell boundaries stay put while it animates. */
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = Math.round(Math.min(100, (value / max) * 100) / 10) * 10;
    return (
        <div className="stat-bar">
            <span className="stat-label">{label}</span>
            <div className="stat-track" role="img" aria-label={`${label} ${pct / 10} / 10`}>
                <motion.div
                    className="stat-fill"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }}
                    initial={{ clipPath: 'inset(0 100% 0 0)' }}
                    animate={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}
