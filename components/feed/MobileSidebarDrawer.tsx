'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { LeftSidebar } from './LeftSidebar';

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarDrawerProps) {
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

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-site-bg border-r border-site-border shadow-xl animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between p-3 border-b border-site-border">
          <span className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            RMH
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-56px)]">
          <LeftSidebar />
        </div>
      </div>
    </div>
  );
}
