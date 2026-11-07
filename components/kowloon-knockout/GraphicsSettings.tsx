'use client';

import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';
import { MENU_FIGHTERS_SETTINGS, type MenuFightersSetting } from '@/lib/kowloon-knockout/render/menuQuality';
import './kk-screens.css';

const PRESETS: { value: TierPreference; tKey: string; defaultLabel: string }[] = [
    { value: 'auto', tKey: 'quality-auto', defaultLabel: 'Auto' },
    { value: 'ultra', tKey: 'quality-ultra', defaultLabel: 'Ultra' },
    { value: 'high', tKey: 'quality-high', defaultLabel: 'High' },
    { value: 'medium', tKey: 'quality-medium', defaultLabel: 'Medium' },
    { value: 'low', tKey: 'quality-low', defaultLabel: 'Low' },
];

const MENU_FIGHTER_LABELS: Record<MenuFightersSetting, { tKey: string; defaultLabel: string }> = {
    auto: { tKey: 'menu-fighters-auto', defaultLabel: 'Auto' },
    smooth: { tKey: 'menu-fighters-smooth', defaultLabel: 'Smooth' },
    pixel: { tKey: 'menu-fighters-pixel', defaultLabel: 'Pixel' },
    off: { tKey: 'menu-fighters-off', defaultLabel: 'Off' },
};

/** Main-menu graphics settings: quality preset + recent-match FPS readout.
 *  'Auto' enables the adaptive downscale governor; a specific tier locks it.
 *  FPS reflects the most recent gameplay (updated in-match by the Governor). */
export default function GraphicsSettings({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation("c-kowloon-knockout");
    const preference = useGraphicsStore((s) => s.preference);
    const setPreference = useGraphicsStore((s) => s.setPreference);
    const fps = useGraphicsStore((s) => s.fps);
    const menuFighters = useGraphicsStore((s) => s.menuFighters);
    const setMenuFighters = useGraphicsStore((s) => s.setMenuFighters);

    return (
        <motion.div
            className="kk-graphics-panel"
            role="region"
            aria-label={t("graphics", { defaultValue: "GRAPHICS" })}
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
                        aria-pressed={preference === p.value}
                        onClick={() => setPreference(p.value)}
                    >
                        {t(p.tKey, { defaultValue: p.defaultLabel })}
                    </button>
                ))}
            </div>
            <h3 className="kk-graphics-subtitle">{t("menu-fighters", { defaultValue: "Menu fighters" })}</h3>
            <div className="kk-graphics-presets" role="group" aria-label={t("menu-fighters", { defaultValue: "Menu fighters" })}>
                {MENU_FIGHTERS_SETTINGS.map((m) => (
                    <button
                        key={m}
                        className={`neon-button neon-button-controls${menuFighters === m ? ' is-active' : ''}`}
                        aria-pressed={menuFighters === m}
                        onClick={() => setMenuFighters(m)}
                    >
                        {t(MENU_FIGHTER_LABELS[m].tKey, { defaultValue: MENU_FIGHTER_LABELS[m].defaultLabel })}
                    </button>
                ))}
            </div>
            <p className="kk-graphics-hint">
                {t("menu-fighters-hint", { defaultValue: "The two fighters sparring behind the menu. Smooth is sharp and anti-aliased, Pixel matches the street, Off saves battery." })}
            </p>
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
