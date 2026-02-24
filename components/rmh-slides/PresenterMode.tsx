'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getTransitionAnimation } from '@/lib/rmh-slides/transitions';
import type { SlideData, SlideElement, TransitionType } from './types';

interface Props {
  slides: SlideData[];
  slideOrder: string[];
  initialSlideId: string | null;
  onExit: () => void;
}

export default function PresenterMode({ slides, slideOrder, initialSlideId, onExit }: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialSlideId) {
      const idx = slideOrder.indexOf(initialSlideId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [transitionAnim, setTransitionAnim] = useState<string>('none');
  const [elapsed, setElapsed] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());

  const currentSlideId = slideOrder[currentIndex];
  const currentSlide = slides.find((s) => s.id === currentSlideId) || null;

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const goToSlide = useCallback((index: number, transition?: TransitionType) => {
    if (index < 0 || index >= slideOrder.length) return;
    const slideId = slideOrder[index];
    const slide = slides.find((s) => s.id === slideId);
    const trans = transition || slide?.transition || 'none';
    const anim = getTransitionAnimation(trans);
    setTransitionAnim(anim);
    setCurrentIndex(index);
    // Clear animation after it plays
    if (anim !== 'none') {
      setTimeout(() => setTransitionAnim('none'), 600);
    }
  }, [slideOrder, slides]);

  const nextSlide = useCallback(() => {
    if (currentIndex < slideOrder.length - 1) {
      const nextIdx = currentIndex + 1;
      const nextSlideId = slideOrder[nextIdx];
      const nextSlideData = slides.find((s) => s.id === nextSlideId);
      goToSlide(nextIdx, nextSlideData?.transition);
    }
  }, [currentIndex, slideOrder, slides, goToSlide]);

  const prevSlide = useCallback(() => {
    goToSlide(currentIndex - 1, 'fade');
  }, [currentIndex, goToSlide]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevSlide();
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
        case 'Home':
          e.preventDefault();
          goToSlide(0);
          break;
        case 'End':
          e.preventDefault();
          goToSlide(slideOrder.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextSlide, prevSlide, goToSlide, onExit, slideOrder.length]);

  // Fullscreen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const requestFs = () => {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };

    requestFs();

    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        onExit();
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [onExit]);

  // Click to advance
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width * 0.3) {
      prevSlide();
    } else {
      nextSlide();
    }
  }, [nextSlide, prevSlide]);

  const progress = slideOrder.length > 1 ? ((currentIndex) / (slideOrder.length - 1)) * 100 : 100;

  return (
    <div
      ref={containerRef}
      className="slides-presenter-overlay"
      onClick={handleClick}
    >
      {/* Slide content */}
      {currentSlide && (
        <div
          className="slides-presenter-slide"
          style={{
            animation: transitionAnim,
            background: currentSlide.background,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100vw',
              height: '100vh',
              maxWidth: '100vw',
              maxHeight: '100vh',
              aspectRatio: '16 / 9',
              overflow: 'hidden',
            }}
          >
            {currentSlide.elements.map((element) => (
              <PresenterElement key={element.id} element={element} />
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="slides-presenter-progress">
        <div className="slides-presenter-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Controls overlay */}
      <div className="slides-presenter-controls">
        <span>{currentIndex + 1} / {slideOrder.length}</span>
        <span>{formatTime(elapsed)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
        >
          ESC
        </button>
      </div>
    </div>
  );
}

// ── Element rendering for presenter mode ──
function PresenterElement({ element }: { element: SlideElement }) {
  const { x, y, width, height, type, content, style: elStyle, zIndex, rotation } = element;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    height: `${height}%`,
    zIndex,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    overflow: 'hidden',
  };

  if (type === 'text') {
    return (
      <div
        style={{
          ...baseStyle,
          fontSize: elStyle.fontSize ? `${elStyle.fontSize}px` : '20px',
          color: elStyle.color || '#ffffff',
          fontWeight: elStyle.bold ? 700 : undefined,
          fontStyle: elStyle.italic ? 'italic' : undefined,
          textAlign: (elStyle.textAlign as React.CSSProperties['textAlign']) || 'left',
          fontFamily: elStyle.fontFamily || 'Inter, sans-serif',
          lineHeight: 1.4,
          padding: '4px 8px',
          boxSizing: 'border-box',
        }}
        dangerouslySetInnerHTML={{ __html: content || '' }}
      />
    );
  }

  if (type === 'image') {
    if (!content) return <div style={baseStyle} />;
    return (
      <img
        src={content}
        alt=""
        style={{
          ...baseStyle,
          objectFit: (elStyle.objectFit as React.CSSProperties['objectFit']) || 'cover',
          borderRadius: elStyle.borderRadius ? `${elStyle.borderRadius}px` : '0',
        }}
      />
    );
  }

  if (type === 'shape') {
    return (
      <div style={baseStyle}>
        <PresenterShape element={element} />
      </div>
    );
  }

  return null;
}

function PresenterShape({ element }: { element: SlideElement }) {
  const shapeType = element.content || 'rectangle';
  const fill = element.style.fill || '#f97316';
  const stroke = element.style.stroke || 'none';
  const strokeWidth = element.style.strokeWidth || 0;
  const borderRadius = element.style.borderRadius || 0;

  switch (shapeType) {
    case 'rectangle':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x={strokeWidth / 2} y={strokeWidth / 2} width={100 - strokeWidth} height={100 - strokeWidth} rx={borderRadius} ry={borderRadius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'circle':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <ellipse cx="50" cy="50" rx={50 - strokeWidth / 2} ry={50 - strokeWidth / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'triangle':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,2 98,98 2,98" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </svg>
      );
    case 'arrow':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
          <defs><marker id={`pres-arr-${element.id}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={fill} /></marker></defs>
          <line x1="5" y1="30" x2="85" y2="30" stroke={fill} strokeWidth={Math.max(strokeWidth, 3)} markerEnd={`url(#pres-arr-${element.id})`} />
        </svg>
      );
    case 'line':
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="2" y1="50" x2="98" y2="50" stroke={fill} strokeWidth={Math.max(strokeWidth, 2)} strokeLinecap="round" />
        </svg>
      );
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const r = i % 2 === 0 ? 48 : 20;
        pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
      }
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={pts.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </svg>
      );
    }
    default:
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill={fill} />
        </svg>
      );
  }
}
