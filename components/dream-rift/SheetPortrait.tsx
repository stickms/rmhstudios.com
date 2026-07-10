'use client';

/**
 * Renders a single frame from a sprite sheet via CSS background-position — used
 * for character/boss portraits in menus and dialogue without needing the image
 * decoded into a canvas. Pixel-art crisp.
 */

export function SheetPortrait({
    url,
    frame = 1,
    cols = 4,
    frameSize = 64,
    size,
    className,
}: {
    url: string;
    frame?: number;
    cols?: number;
    frameSize?: number;
    size: number;
    className?: string;
}) {
    const scale = size / frameSize;
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    return (
        <div
            className={className}
            style={{
                width: size,
                height: size,
                backgroundImage: `url(${url})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${cols * size}px auto`,
                backgroundPosition: `${-col * size}px ${-row * size}px`,
                imageRendering: 'pixelated',
            }}
        />
    );
}
