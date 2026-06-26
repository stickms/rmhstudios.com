'use client';

import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';

const PRESETS: { value: TierPreference; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'ultra', label: 'Ultra' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

/** Main-menu graphics settings: quality preset + recent-match FPS readout.
 *  'Auto' enables the adaptive downscale governor; a specific tier locks it.
 *  FPS reflects the most recent gameplay (updated in-match by the Governor). */
export default function GraphicsSettings() {
    const preference = useGraphicsStore((s) => s.preference);
    const setPreference = useGraphicsStore((s) => s.setPreference);
    const fps = useGraphicsStore((s) => s.fps);

    return (
        <div className="kk-graphics-panel">
            <h2 className="controls-title">GRAPHICS</h2>
            <div className="kk-graphics-presets">
                {PRESETS.map((p) => (
                    <button
                        key={p.value}
                        className={`neon-button neon-button-controls${preference === p.value ? ' is-active' : ''}`}
                        onClick={() => setPreference(p.value)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="kk-graphics-fps">
                {fps > 0 ? `Recent FPS: ${fps}` : 'Recent FPS: —'}
            </div>
            <p className="kk-graphics-hint">
                Auto adapts quality to keep the frame rate smooth. Pick a level to lock it.
            </p>
        </div>
    );
}
