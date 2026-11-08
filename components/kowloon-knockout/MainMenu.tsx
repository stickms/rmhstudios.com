'use client';

import { m as motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useState } from 'react';
import { COMBO_DEFS } from '@/lib/kowloon-knockout/game/combat/combos';
import { useTranslation } from 'react-i18next';
import { useQuitGame } from '@/hooks/useQuitGame';
import GraphicsSettings from './GraphicsSettings';
import { TrainingMenuButton } from './TrainingRoom';
import MenuBackdrop from './MenuBackdrop';
import './kk-menu.css';
import './kk-screens.css';

export default function MainMenu() {
    const { t } = useTranslation("c-kowloon-knockout");
    const { setPhase, setMultiplayer } = useGameStore();
    const quit = useQuitGame();
    const [showControls, setShowControls] = useState(false);
    const [showCombos, setShowCombos] = useState(false);
    const [showGraphics, setShowGraphics] = useState(false);

    return (
        <div className="menu-container kk-menu">
            <MenuBackdrop />

            <div className="kk-menu__scroll">
                <motion.div
                    className="menu-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                >
                    <div className="title-container">
                        {/* The wordmark, hanzi included, is the logo art. */}
                        <h1 className="game-title">
                            <img
                                className="kk-logo"
                                src="/images/games/logos/kowloon-knockout.svg"
                                alt={t("game-title", { defaultValue: "Kowloon Knockout" })}
                                width={1120}
                                height={567}
                                decoding="async"
                                fetchPriority="high"
                            />
                        </h1>
                        <div className="title-tagline">{t("menu-tagline", { defaultValue: "HONG KONG • 1997" })}</div>
                        <span className="kk-ticket" aria-hidden="true">REEL 07 · FRAME 19A</span>
                    </div>

                    <motion.div
                        className="menu-buttons"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                    >
                        <motion.button
                            className="neon-button neon-button-fight"
                            onClick={() => { setMultiplayer(false); setPhase('select'); }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("fight", { defaultValue: "FIGHT" })}
                        </motion.button>

                        <motion.button
                            className="neon-button neon-button-versus"
                            onClick={() => { setMultiplayer(true); setPhase('select'); }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("versus", { defaultValue: "VERSUS" })}
                        </motion.button>

                        <TrainingMenuButton />

                        <motion.button
                            className="neon-button neon-button-controls kk-util"
                            aria-expanded={showControls}
                            onClick={() => { setShowControls(!showControls); setShowCombos(false); setShowGraphics(false); }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("how-to-play", { defaultValue: "HOW TO PLAY" })}
                        </motion.button>

                        <motion.button
                            className="neon-button neon-button-controls kk-util"
                            aria-expanded={showCombos}
                            onClick={() => { setShowCombos(!showCombos); setShowControls(false); setShowGraphics(false); }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("combos", { defaultValue: "COMBOS" })}
                        </motion.button>

                        <motion.button
                            className="neon-button neon-button-controls kk-util"
                            aria-expanded={showGraphics}
                            onClick={() => { setShowGraphics(!showGraphics); setShowControls(false); setShowCombos(false); }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("graphics", { defaultValue: "GRAPHICS" })}
                        </motion.button>

                        <motion.button
                            className="neon-button neon-button-controls kk-util kk-quit"
                            onClick={quit}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            {t("quit", { defaultValue: "QUIT" })}
                        </motion.button>
                    </motion.div>

                    {showControls && (
                        <motion.div
                            className="controls-modal"
                            role="region"
                            aria-label={t("controls", { defaultValue: "CONTROLS" })}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h2 className="controls-title">{t("controls", { defaultValue: "CONTROLS" })}</h2>
                            <p className="controls-touch-note">
                                {t("touch-note", { defaultValue: "On a phone or tablet, use the on-screen stick and punch buttons." })}
                            </p>
                            <div className="controls-grid">
                                <div className="controls-section">
                                    <h3>{t("movement", { defaultValue: "MOVEMENT" })}</h3>
                                    <div className="control-row">
                                        <kbd>A</kbd> / <kbd>←</kbd>
                                        <span>{t("move-left", { defaultValue: "Move Left" })}</span>
                                    </div>
                                    <div className="control-row">
                                        <kbd>D</kbd> / <kbd>→</kbd>
                                        <span>{t("move-right", { defaultValue: "Move Right" })}</span>
                                    </div>
                                    <div className="control-row">
                                        <kbd>S</kbd> / <kbd>↓</kbd>
                                        <span>{t("block", { defaultValue: "Block" })}</span>
                                    </div>
                                </div>

                                <div className="controls-section">
                                    <h3>{t("punches", { defaultValue: "PUNCHES" })}</h3>
                                    <div className="control-row">
                                        <kbd>J</kbd>
                                        <span>{t("jab", { defaultValue: "Jab" })} <small>{t("jab-desc", { defaultValue: "(fast, low dmg)" })}</small></span>
                                    </div>
                                    <div className="control-row">
                                        <kbd>K</kbd>
                                        <span>{t("cross", { defaultValue: "Cross" })} <small>{t("cross-desc", { defaultValue: "(med speed/dmg)" })}</small></span>
                                    </div>
                                    <div className="control-row">
                                        <kbd>L</kbd>
                                        <span>{t("hook", { defaultValue: "Hook" })} <small>{t("hook-desc", { defaultValue: "(slow, high dmg)" })}</small></span>
                                    </div>
                                    <div className="control-row">
                                        <kbd>U</kbd>
                                        <span>{t("uppercut", { defaultValue: "Uppercut" })} <small>{t("uppercut-desc", { defaultValue: "(slowest, max dmg)" })}</small></span>
                                    </div>
                                </div>

                                <div className="controls-section combos-section">
                                    <h3>{t("combos", { defaultValue: "COMBOS" })}</h3>
                                    <div className="control-row">
                                        <span className="combo-keys">J → K</span>
                                        <span>{t("one-two", { defaultValue: "One-Two" })} <small>(+20%)</small></span>
                                    </div>
                                    <div className="control-row">
                                        <span className="combo-keys">J → K → L</span>
                                        <span>{t("classic-triple", { defaultValue: "Classic Triple" })} <small>(+35%)</small></span>
                                    </div>
                                    <div className="control-row">
                                        <span className="combo-keys">J → J → U</span>
                                        <span>{t("body-breaker", { defaultValue: "Body Breaker" })} <small>(+30%)</small></span>
                                    </div>
                                    <div className="control-row">
                                        <span className="combo-keys">K → L → U</span>
                                        <span>{t("haymaker", { defaultValue: "Haymaker" })} <small>(+50%)</small></span>
                                    </div>
                                    <div className="control-row">
                                        <span className="combo-keys">J → K → L → U</span>
                                        <span>{t("fury-combo", { defaultValue: "Fury Combo" })} <small>(+75%)</small></span>
                                    </div>
                                </div>
                            </div>

                            <button
                                className="neon-button neon-button-close"
                                onClick={() => setShowControls(false)}
                            >
                                {t("close", { defaultValue: "CLOSE" })}
                            </button>
                        </motion.div>
                    )}

                    {showCombos && (
                        <motion.div
                            className="controls-modal"
                            role="region"
                            aria-label={t("combos", { defaultValue: "COMBOS" })}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h2 className="controls-title">{t("combos", { defaultValue: "COMBOS" })}</h2>
                            <div className="controls-grid">
                                <div className="controls-section combos-section">
                                    {COMBO_DEFS.map((combo) => {
                                        const keyMap: Record<string, string> = {
                                            jab: 'J', cross: 'K', hook: 'L', uppercut: 'U',
                                        };
                                        return (
                                            <div className="control-row" key={combo.name}>
                                                <span className="combo-keys">
                                                    {combo.sequence.map(p => keyMap[p]).join(' → ')}
                                                </span>
                                                <span>
                                                    {combo.displayName.replace(/[★!]/g, '').trim()}{' '}
                                                    <small>(+{Math.round((combo.bonusDamageMultiplier - 1) * 100)}%)</small>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <button
                                className="neon-button neon-button-close"
                                onClick={() => setShowCombos(false)}
                            >
                                {t("close", { defaultValue: "CLOSE" })}
                            </button>
                        </motion.div>
                    )}

                    {showGraphics && <GraphicsSettings onClose={() => setShowGraphics(false)} />}
                </motion.div>

                <div className="menu-footer">
                    <span>{t("press-start", { defaultValue: "PRESS START" })}</span>
                </div>
            </div>
        </div>
    );
}
