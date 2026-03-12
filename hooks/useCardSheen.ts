import { useRef, useCallback, useState } from 'react';

export function useCardSheen() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sheenPos, setSheenPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setSheenPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const sheenStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 20,
    opacity: isHovered ? 1 : 0,
    background: `radial-gradient(350px circle at ${sheenPos.x}px ${sheenPos.y}px, rgba(255,255,255,0.12), transparent 60%)`,
    transition: 'opacity 0.3s',
  };

  return {
    cardRef,
    sheenStyle,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
  };
}
