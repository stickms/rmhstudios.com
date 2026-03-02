'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { useEffect, useState } from 'react';
import { COMBO_DEFS } from '@/lib/kowloon-knockout/game/combat/combos';

export default function MainMenu() {
    const { setPhase, setMultiplayer } = useGameStore();
    const [showControls, setShowControls] = useState(false);
    const [showCombos, setShowCombos] = useState(false);
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
                        onClick={() => setPhase('select')}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        FIGHT
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-versus"
                        onClick={() => { setMultiplayer(true); setPhase('select'); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        VERSUS
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-controls"
                        onClick={() => { setShowControls(!showControls); setShowCombos(false); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        HOW TO PLAY
                    </motion.button>

                    <motion.button
                        className="neon-button neon-button-controls"
                        onClick={() => { setShowCombos(!showCombos); setShowControls(false); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        COMBOS
                    </motion.button>
                </motion.div>

                {showControls && (
                    <motion.div
                        className="controls-modal"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h2 className="controls-title">CONTROLS</h2>
                        <div className="controls-grid">
                            <div className="controls-section">
                                <h3>MOVEMENT</h3>
                                <div className="control-row">
                                    <kbd>A</kbd> / <kbd>←</kbd>
                                    <span>Move Left</span>
                                </div>
                                <div className="control-row">
                                    <kbd>D</kbd> / <kbd>→</kbd>
                                    <span>Move Right</span>
                                </div>
                                <div className="control-row">
                                    <kbd>S</kbd> / <kbd>↓</kbd>
                                    <span>Block</span>
                                </div>
                            </div>

                            <div className="controls-section">
                                <h3>PUNCHES</h3>
                                <div className="control-row">
                                    <kbd>J</kbd>
                                    <span>Jab <small>(fast, low dmg)</small></span>
                                </div>
                                <div className="control-row">
                                    <kbd>K</kbd>
                                    <span>Cross <small>(med speed/dmg)</small></span>
                                </div>
                                <div className="control-row">
                                    <kbd>L</kbd>
                                    <span>Hook <small>(slow, high dmg)</small></span>
                                </div>
                                <div className="control-row">
                                    <kbd>U</kbd>
                                    <span>Uppercut <small>(slowest, max dmg)</small></span>
                                </div>
                            </div>

                            <div className="controls-section combos-section">
                                <h3>COMBOS</h3>
                                <div className="control-row">
                                    <span className="combo-keys">J → K</span>
                                    <span>One-Two <small>(+20%)</small></span>
                                </div>
                                <div className="control-row">
                                    <span className="combo-keys">J → K → L</span>
                                    <span>Classic Triple <small>(+35%)</small></span>
                                </div>
                                <div className="control-row">
                                    <span className="combo-keys">J → J → U</span>
                                    <span>Body Breaker <small>(+30%)</small></span>
                                </div>
                                <div className="control-row">
                                    <span className="combo-keys">K → L → U</span>
                                    <span>Haymaker <small>(+50%)</small></span>
                                </div>
                                <div className="control-row">
                                    <span className="combo-keys">J → K → L → U</span>
                                    <span>Fury Combo <small>(+75%)</small></span>
                                </div>
                            </div>
                        </div>

                        <button
                            className="neon-button neon-button-close"
                            onClick={() => setShowControls(false)}
                        >
                            CLOSE
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
                        <h2 className="controls-title">COMBOS</h2>
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
                            CLOSE
                        </button>
                    </motion.div>
                )}
            </motion.div>

            <div className="menu-footer">
                <span>PRESS START</span>
            </div>
        </div>
    );
}
