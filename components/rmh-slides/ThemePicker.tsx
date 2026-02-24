'use client';

import { slideThemes } from '@/lib/rmh-slides/themes';
import type { SlideTheme } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onApplyTheme: (theme: SlideTheme) => void;
}

export default function ThemePicker({ open, onClose, onApplyTheme }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl"
        style={{ background: 'var(--slides-surface)', border: '1px solid var(--slides-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--slides-border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--slides-text)' }}>Slide Themes</h2>
          <button
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--slides-text-muted)' }}
          >
            Close
          </button>
        </div>

        <div className="p-4 grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
          {slideThemes.map((theme) => (
            <button
              key={theme.name}
              onClick={() => { onApplyTheme(theme); onClose(); }}
              className="group flex flex-col gap-2 p-2 rounded-lg transition-all hover:bg-white/5 text-left"
            >
              {/* Mini preview */}
              <div
                className="aspect-video rounded-md border overflow-hidden flex flex-col items-center justify-center relative"
                style={{ background: theme.colors.bg, borderColor: 'var(--slides-border)' }}
              >
                <div
                  className="text-[9px] font-bold"
                  style={{ color: theme.colors.text }}
                >
                  Title Text
                </div>
                <div
                  className="text-[6px] mt-0.5"
                  style={{ color: theme.colors.accent }}
                >
                  Subtitle
                </div>
                <div
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[40%] h-[3px] rounded"
                  style={{ background: theme.colors.accent }}
                />
              </div>
              <span className="text-[11px] font-medium" style={{ color: 'var(--slides-text)' }}>
                {theme.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
