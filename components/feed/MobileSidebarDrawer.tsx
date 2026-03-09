'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarDrawerProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Mount the component when open becomes true
  useEffect(() => {
    if (open) {
      setVisible(true);
    } else if (visible) {
      setAnimating(false);
      const timeout = setTimeout(() => setVisible(false), 150);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  // Trigger slide-in animation after the component has mounted and painted
  useEffect(() => {
    if (visible && open) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    }
  }, [visible, open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!visible) return null;

  return (
    <div className="md:hidden fixed inset-0 z-100" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          animating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-label="Close menu"
      />
      {/* Drawer */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-64 bg-site-bg border-r border-site-border shadow-xl transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          animating ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-site-border">
          <span className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            RMH
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-56px)]">
          <LeftSidebar expanded />
          <div className="h-8 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
