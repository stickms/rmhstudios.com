'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ZoomIn, ZoomOut, Printer } from 'lucide-react';
import type { ResearchArticle } from '@/lib/research';
import { PaperContent } from './PaperContent';

export function PaperViewer({ article }: { article: ResearchArticle }) {
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // On small screens, fit paper width to viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewportWidth = container.clientWidth - 32;
    const paperWidth = 8.5 * 96; // 816px at 96dpi
    if (viewportWidth < paperWidth) {
      setZoom(Math.round((viewportWidth / paperWidth) * 100));
    }
  }, []);

  const zoomIn = () => setZoom((z) => Math.min(z + 10, 200));
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 30));

  const fitToWidth = () => {
    const container = containerRef.current;
    if (!container) return;
    const viewportWidth = container.clientWidth - 32;
    const paperWidth = 8.5 * 96;
    if (viewportWidth < paperWidth) {
      setZoom(Math.round((viewportWidth / paperWidth) * 100));
    } else {
      setZoom(100);
    }
  };

  const handlePrint = () => window.print();

  // Pinch-to-zoom
  const pinchRef = useRef({ lastDist: 0, startZoom: 100 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchRef.current.lastDist = getDistance(e.touches);
        pinchRef.current.startZoom = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.lastDist > 0) {
        e.preventDefault();
        const dist = getDistance(e.touches);
        const scale = dist / pinchRef.current.lastDist;
        const newZoom = Math.round(
          Math.min(200, Math.max(30, pinchRef.current.startZoom * scale))
        );
        setZoom(newZoom);
      }
    };

    const onTouchEnd = () => {
      pinchRef.current.lastDist = 0;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <div
      data-paper-viewer
      data-no-twemoji
      className="h-screen flex flex-col bg-[#525659]"
    >
      {/* Print styles */}
      <style>{`
        @media print {
          [data-paper-toolbar] { display: none !important; }
          [data-paper-viewer] { background: white !important; padding: 0 !important; height: auto !important; }
          [data-paper-page] {
            box-shadow: none !important;
            zoom: 1 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          nav { display: none !important; }
          body { padding: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div
        data-paper-toolbar
        className="bg-[#323639] border-b border-[#1a1a1a] shadow-lg shrink-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-12">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href="/research"
              className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Back</span>
            </Link>
            <span className="text-gray-500">|</span>
            <span className="text-sm text-gray-300 truncate">
              {article.title}
            </span>
          </div>

          {/* Right: zoom + print */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={zoomOut}
              className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={fitToWidth}
              className="text-xs text-gray-400 hover:text-white w-10 text-center tabular-nums transition-colors"
              aria-label="Fit to width"
            >
              {zoom}%
            </button>
            <button
              onClick={zoomIn}
              className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-gray-600 mx-1">|</span>
            <button
              onClick={handlePrint}
              className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              aria-label="Print / Download PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable paper container — scrolls both directions like a PDF viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="inline-flex min-w-full justify-center p-4">
          <div
            data-paper-page
            className="bg-white text-gray-900 shadow-2xl shrink-0"
            style={{
              width: '8.5in',
              minHeight: '11in',
              padding: '1in',
              fontFamily: "'Georgia', 'Times New Roman', serif",
              zoom: zoom / 100,
            }}
          >
            <PaperContent article={article} />
          </div>
        </div>
      </div>
    </div>
  );
}
