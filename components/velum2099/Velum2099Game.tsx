'use client';

import { useEffect, useRef } from 'react';
import './velum2099-global.css';
import './velum2099-terminal.css';

export function Velum2099Game() {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<{ destroy: () => void } | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || appRef.current) return;

        let destroyed = false;

        const init = async () => {
            // Load OpenCV.js optionally (graceful degradation if it fails)
            if (!(window as any).cv) {
                const script = document.createElement('script');
                script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
                script.async = true;
                document.head.appendChild(script);
            }

            // Dynamically import the game engine (avoid SSR)
            const { App } = await import('./game/main');
            if (destroyed) return;

            const app = new App(container);
            appRef.current = app;
        };

        init();

        return () => {
            destroyed = true;
            if (appRef.current) {
                appRef.current.destroy();
                appRef.current = null;
            }
        };
    }, []);

    return (
        <div ref={containerRef} className="velum2099-root fixed inset-0">
            <div id="terminal-screen" />
            <canvas id="game-canvas" style={{ display: 'none' }} />
            <div id="vhs-timestamp" style={{ display: 'none' }} />
            <div id="hex-hud" style={{ display: 'none' }}>
                <canvas id="hex-tl" className="hex-corner" style={{ top: 0, left: 0 }} />
                <canvas id="hex-tr" className="hex-corner" style={{ top: 0, right: 0 }} />
                <canvas id="hex-bl" className="hex-corner" style={{ bottom: 0, left: 0 }} />
                <canvas id="hex-br" className="hex-corner" style={{ bottom: 0, right: 0 }} />
            </div>
        </div>
    );
}
