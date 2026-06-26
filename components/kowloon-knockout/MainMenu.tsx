'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useEffect, useState } from 'react';
import { COMBO_DEFS } from '@/lib/kowloon-knockout/game/combat/combos';
import { useTranslation } from 'react-i18next';
import GraphicsSettings from './GraphicsSettings';

export default function MainMenu() {
    const { t } = useTranslation("c-kowloon-knockout");
    const { setPhase, setMultiplayer } = useGameStore();
    const [showControls, setShowControls] = useState(false);
    const [showCombos, setShowCombos] = useState(false);
    const [showGraphics, setShowGraphics] = useState(false);
    const [flickerClass, setFlickerClass] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            if (Math.random() < 0.15) {
                setFlickerClass('neon-flicker');
                setTimeout(() => setFlickerClass(''), 150);
            }
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="menu-container">
            <div className="menu-bg">
                {/* Cityscape silhouette */}
                <div className="city-skyline" />

                {/* Neon sign decorations */}
                <div className="neon-sign neon-sign-1">功夫</div>
                <div className="neon-sign neon-sign-2">格鬥</div>
                <div className="neon-sign neon-sign-3">武術</div>
                <div className="neon-sign neon-sign-4">拳王</div>

                {/* Vertical neon strips */}
                <div className="neon-strip neon-strip-1" />
                <div className="neon-strip neon-strip-2" />
                <div className="neon-strip neon-strip-3" />
                <div className="neon-strip neon-strip-4" />

                {/* Ambient glow */}
                <div className="menu-glow menu-glow-pink" />
                <div className="menu-glow menu-glow-blue" />
            </div>

            <motion.div
                className="menu-content"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            >
                <div className={`title-container ${flickerClass}`}>
                    <h1 className="game-title">
                        <span className="title-kowloon">KOWLOON</span>
                        <span className="title-knockout">KNOCKOUT</span>
                    </h1>
                    <div className="title-subtitle">九龍淘汰賽</div>
                    <div className="title-tagline">HONG KONG &bull; 1997</div>
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
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t("fight", { defaultValue: "FIGHT" })}
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-versus"
                        onClick={() => { setMultiplayer(true); setPhase('select'); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t("versus", { defaultValue: "VERSUS" })}
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-controls"
                        onClick={() => { setShowControls(!showControls); setShowCombos(false); setShowGraphics(false); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t("how-to-play", { defaultValue: "HOW TO PLAY" })}
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-controls"
                        onClick={() => { setShowCombos(!showCombos); setShowControls(false); setShowGraphics(false); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t("combos", { defaultValue: "COMBOS" })}
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-controls"
                        onClick={() => { setShowGraphics(!showGraphics); setShowControls(false); setShowCombos(false); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {t("graphics", { defaultValue: "GRAPHICS" })}
                    </motion.button>
                </motion.div>

                {showControls && (
                    <motion.div
                        className="controls-modal"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h2 className="controls-title">{t("controls", { defaultValue: "CONTROLS" })}</h2>
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
    );
}
