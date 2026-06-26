'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';

const PRESETS: { value: TierPreference; tKey: string; defaultLabel: string }[] = [
    { value: 'auto', tKey: 'quality-auto', defaultLabel: 'Auto' },
    { value: 'ultra', tKey: 'quality-ultra', defaultLabel: 'Ultra' },
    { value: 'high', tKey: 'quality-high', defaultLabel: 'High' },
    { value: 'medium', tKey: 'quality-medium', defaultLabel: 'Medium' },
    { value: 'low', tKey: 'quality-low', defaultLabel: 'Low' },
];

/** Main-menu graphics settings: quality preset + recent-match FPS readout.
 *  'Auto' enables the adaptive downscale governor; a specific tier locks it.
 *  FPS reflects the most recent gameplay (updated in-match by the Governor). */
export default function GraphicsSettings({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation("c-kowloon-knockout");
    const preference = useGraphicsStore((s) => s.preference);
    const setPreference = useGraphicsStore((s) => s.setPreference);
    const fps = useGraphicsStore((s) => s.fps);

    return (
        <motion.div
            className="kk-graphics-panel"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
        >
            <h2 className="controls-title">{t("graphics", { defaultValue: "GRAPHICS" })}</h2>
            <div className="kk-graphics-presets">
                {PRESETS.map((p) => (
                    <button
                        key={p.value}
                        className={`neon-button neon-button-controls${preference === p.value ? ' is-active' : ''}`}
                        onClick={() => setPreference(p.value)}
                    >
                        {t(p.tKey, { defaultValue: p.defaultLabel })}
                    </button>
                ))}
            </div>
            <div className="kk-graphics-fps">
                {fps > 0 ? `${t("recent-fps", { defaultValue: "Recent FPS" })}: ${fps}` : `${t("recent-fps", { defaultValue: "Recent FPS" })}: —`}
            </div>
            <p className="kk-graphics-hint">
                {t("graphics-hint", { defaultValue: "Auto adapts quality to keep the frame rate smooth. Pick a level to lock it." })}
            </p>
            <button
                className="neon-button neon-button-close"
                onClick={onClose}
            >
                {t("close", { defaultValue: "CLOSE" })}
            </button>
        </motion.div>
    );
}
