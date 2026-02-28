'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ZoomIn, ZoomOut, Printer } from 'lucide-react';
import type { ResearchArticle } from '@/lib/research';
import { PaperContent } from './PaperContent';

export function PaperViewer({ article }: { article: ResearchArticle }) {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (window.innerWidth < 768) setZoom(60);
  }, []);

  const zoomIn = () => setZoom((z) => Math.min(z + 10, 200));
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 50));

  const handlePrint = () => window.print();

  return (
    <div data-paper-viewer data-no-twemoji className="min-h-screen bg-[#525659]">
      {/* Print styles */}
      <style>{`
        @media print {
          [data-paper-toolbar] { display: none !important; }
          [data-paper-viewer] { background: white !important; padding: 0 !important; }
          [data-paper-page] {
            box-shadow: none !important;
            transform: none !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          nav { display: none !important; }
          body { padding: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {/* Fixed toolbar */}
      <div
        data-paper-toolbar
        className="fixed top-16 left-0 right-0 z-50 bg-[#323639] border-b border-[#1a1a1a] shadow-lg"
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
            <span className="text-xs text-gray-400 w-10 text-center tabular-nums">
              {zoom}%
            </span>
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

      {/* Paper container */}
      <div className="pt-32 pb-16 flex justify-center overflow-x-auto">
        <div
          data-paper-page
          className="bg-white text-gray-900 shadow-2xl origin-top"
          style={{
            width: '8.5in',
            minHeight: '11in',
            padding: '1in',
            fontFamily: "'Georgia', 'Times New Roman', serif",
            transform: `scale(${zoom / 100})`,
          }}
        >
          <PaperContent article={article} />
        </div>
      </div>
    </div>
  );
}
