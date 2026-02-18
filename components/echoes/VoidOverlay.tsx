'use client';

import { motion } from 'framer-motion';
import { useEchoesStore } from '@/lib/store/useEchoesStore';
import { useEffect, useState } from 'react';

export const VoidOverlay = () => {
    const entropy = useEchoesStore(state => state.entropy);
    const [clientEntropy, setClientEntropy] = useState(0);

    useEffect(() => {
        setClientEntropy(entropy);
    }, [entropy]);

    // Opacity scales with entropy (0 to 1)
    const opacity = Math.min(clientEntropy / 100, 0.9);

    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {/* Base Static Layer */}
            <motion.div 
                className="absolute inset-0 bg-black"
                animate={{ opacity: opacity * 0.5 }}
            />
            
            {/* Noise Texture */}
            <div className="absolute inset-0 opacity-20 pointer-events-none noisemix" style={{backgroundImage: 'url(/noise.png)'}} />

            {/* Glitch Overlay Elements */}
            {opacity > 0.3 && (
                <motion.div 
                    className="absolute inset-0 bg-transparent mix-blend-exclusion"
                    animate={{
                        x: [0, -5, 5, -2, 0],
                        y: [0, 2, -2, 1, 0],
                        backgroundColor: ["rgba(0,0,0,0)", "rgba(191,0,255,0.1)", "rgba(0,255,255,0.1)", "rgba(0,0,0,0)"]
                    }}
                    transition={{
                        duration: 0.2,
                        repeat: Infinity,
                        repeatDelay: Math.max(0.1, 1 - opacity)
                    }}
                />
            )}

            {/* Vignette */}
            <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(circle, transparent 50%, rgba(0,0,0,${opacity}) 100%)`
                }}
            />
        </div>
    );
};
