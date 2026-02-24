'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Type, Image, Square, Circle, Triangle, Minus, Star, ArrowRight,
  Bold, Italic, Trash2, Copy, ArrowUpToLine, ArrowDownToLine,
  Play, ChevronDown,
} from 'lucide-react';
import type { SlideElement, ShapeType } from './types';

interface Props {
  slideId: string | null;
  selectedElement: SlideElement | null;
  onAddElement: (element: SlideElement) => void;
  onUpdateElement: (updates: Partial<SlideElement>) => void;
  onDeleteElement: () => void;
  onDuplicateElement: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onPresent: () => void;
  maxZIndex: number;
}

function makeId(): string {
  return 'el_' + Math.random().toString(36).substring(2, 11);
}

const shapeOptions: { type: ShapeType; icon: typeof Square; label: string }[] = [
  { type: 'rectangle', icon: Square, label: 'Rectangle' },
  { type: 'circle', icon: Circle, label: 'Circle' },
  { type: 'triangle', icon: Triangle, label: 'Triangle' },
  { type: 'arrow', icon: ArrowRight, label: 'Arrow' },
  { type: 'line', icon: Minus, label: 'Line' },
  { type: 'star', icon: Star, label: 'Star' },
];

export default function SlideToolbar({
  slideId,
  selectedElement,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onBringForward,
  onSendBackward,
  onPresent,
  maxZIndex,
}: Props) {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const imageDialogRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(e.target as Node)) {
        setShapeMenuOpen(false);
      }
      if (imageDialogRef.current && !imageDialogRef.current.contains(e.target as Node)) {
        setImageUrlInput(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  const addTextElement = useCallback(() => {
    if (!slideId) return;
    const el: SlideElement = {
      id: makeId(),
      type: 'text',
      x: 20,
      y: 30,
      width: 60,
      height: 15,
      rotation: 0,
      content: '<p>Click to add text</p>',
      zIndex: maxZIndex + 1,
      style: { fontSize: 24, color: '#ffffff', textAlign: 'left' },
    };
    onAddElement(el);
  }, [slideId, maxZIndex, onAddElement]);

  const addImageElement = useCallback((url: string) => {
    if (!slideId) return;
    const el: SlideElement = {
      id: makeId(),
      type: 'image',
      x: 25,
      y: 15,
      width: 50,
      height: 60,
      rotation: 0,
      content: url,
      zIndex: maxZIndex + 1,
      style: { objectFit: 'cover' },
    };
    onAddElement(el);
    setImageUrlInput(false);
    setImageUrl('');
  }, [slideId, maxZIndex, onAddElement]);

  const addShapeElement = useCallback((shapeType: ShapeType) => {
    if (!slideId) return;
    const el: SlideElement = {
      id: makeId(),
      type: 'shape',
      x: 30,
      y: 25,
      width: 20,
      height: shapeType === 'line' || shapeType === 'arrow' ? 5 : 35,
      rotation: 0,
      content: shapeType,
      zIndex: maxZIndex + 1,
      style: { fill: '#f97316', stroke: 'none', strokeWidth: 0 },
    };
    onAddElement(el);
    setShapeMenuOpen(false);
  }, [slideId, maxZIndex, onAddElement]);

  const isText = selectedElement?.type === 'text';
  const isShape = selectedElement?.type === 'shape';

  return (
    <div
      className="flex items-center gap-1 px-3 border-b"
      style={{
        height: 'var(--slides-toolbar-height)',
        background: 'var(--slides-surface)',
        borderColor: 'var(--slides-border)',
      }}
    >
      {/* Insert tools */}
      <ToolbarGroup label="Insert">
        <ToolbarButton icon={Type} label="Text" onClick={addTextElement} disabled={!slideId} />

        <div className="relative" ref={imageDialogRef}>
          <ToolbarButton icon={Image} label="Image" onClick={() => setImageUrlInput(!imageUrlInput)} disabled={!slideId} />
          {imageUrlInput && (
            <div className="absolute top-full left-0 mt-1 p-2 rounded-lg z-50" style={{ background: 'var(--slides-surface-2)', border: '1px solid var(--slides-border)', boxShadow: 'var(--slides-shadow-md)' }}>
              <div className="flex gap-1">
                <input
                  autoFocus
                  placeholder="Image URL..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && imageUrl.trim()) addImageElement(imageUrl.trim()); if (e.key === 'Escape') setImageUrlInput(false); }}
                  className="text-xs px-2 py-1.5 rounded outline-none w-48"
                  style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
                />
                <button
                  onClick={() => imageUrl.trim() && addImageElement(imageUrl.trim())}
                  className="text-xs px-2 py-1.5 rounded font-medium"
                  style={{ background: 'var(--slides-accent)', color: '#fff' }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={shapeMenuRef}>
          <ToolbarButton icon={Square} label="Shape" onClick={() => setShapeMenuOpen(!shapeMenuOpen)} disabled={!slideId} hasDropdown />
          {shapeMenuOpen && (
            <div className="absolute top-full left-0 mt-1 py-1 rounded-lg z-50 min-w-[140px]" style={{ background: 'var(--slides-surface-2)', border: '1px solid var(--slides-border)', boxShadow: 'var(--slides-shadow-md)' }}>
              {shapeOptions.map(({ type, icon: ShapeIcon, label }) => (
                <button
                  key={type}
                  onClick={() => addShapeElement(type)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                  style={{ color: 'var(--slides-text)' }}
                >
                  <ShapeIcon size={14} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </ToolbarGroup>

      <Divider />

      {/* Text formatting (when text element selected) */}
      {isText && (
        <>
          <ToolbarGroup label="Format">
            <ToolbarButton
              icon={Bold}
              label="Bold"
              active={selectedElement.style.bold}
              onClick={() => onUpdateElement({ style: { ...selectedElement.style, bold: !selectedElement.style.bold } })}
            />
            <ToolbarButton
              icon={Italic}
              label="Italic"
              active={selectedElement.style.italic}
              onClick={() => onUpdateElement({ style: { ...selectedElement.style, italic: !selectedElement.style.italic } })}
            />
            <div className="flex items-center gap-1">
              <label className="text-[10px]" style={{ color: 'var(--slides-text-subtle)' }}>Size</label>
              <input
                type="number"
                value={selectedElement.style.fontSize || 20}
                onChange={(e) => onUpdateElement({ style: { ...selectedElement.style, fontSize: parseInt(e.target.value) || 20 } })}
                className="w-12 text-xs text-center rounded px-1 py-1"
                style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
                min={8}
                max={200}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px]" style={{ color: 'var(--slides-text-subtle)' }}>Color</label>
              <input
                type="color"
                value={selectedElement.style.color || '#ffffff'}
                onChange={(e) => onUpdateElement({ style: { ...selectedElement.style, color: e.target.value } })}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              />
            </div>
          </ToolbarGroup>
          <Divider />
        </>
      )}

      {/* Shape formatting */}
      {isShape && (
        <>
          <ToolbarGroup label="Shape">
            <div className="flex items-center gap-1">
              <label className="text-[10px]" style={{ color: 'var(--slides-text-subtle)' }}>Fill</label>
              <input
                type="color"
                value={selectedElement.style.fill || '#f97316'}
                onChange={(e) => onUpdateElement({ style: { ...selectedElement.style, fill: e.target.value } })}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px]" style={{ color: 'var(--slides-text-subtle)' }}>Stroke</label>
              <input
                type="color"
                value={selectedElement.style.stroke || '#000000'}
                onChange={(e) => onUpdateElement({ style: { ...selectedElement.style, stroke: e.target.value } })}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
              />
            </div>
          </ToolbarGroup>
          <Divider />
        </>
      )}

      {/* Element actions */}
      {selectedElement && (
        <ToolbarGroup label="Element">
          <ToolbarButton icon={ArrowUpToLine} label="Forward" onClick={onBringForward} />
          <ToolbarButton icon={ArrowDownToLine} label="Backward" onClick={onSendBackward} />
          <ToolbarButton icon={Copy} label="Duplicate" onClick={onDuplicateElement} />
          <ToolbarButton icon={Trash2} label="Delete" onClick={onDeleteElement} danger />
        </ToolbarGroup>
      )}

      <div className="flex-1" />

      {/* Present button */}
      <button
        onClick={onPresent}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        style={{ background: 'var(--slides-accent)', color: 'var(--slides-accent-fg)' }}
      >
        <Play size={14} fill="currentColor" />
        Present
      </button>
    </div>
  );
}

// ── Sub-components ──

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      {children}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  danger,
  hasDropdown,
}: {
  icon: typeof Type;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  hasDropdown?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-0.5 px-2 py-1.5 rounded text-xs transition-colors disabled:opacity-30"
      style={{
        background: active ? 'rgba(249,115,22,0.15)' : 'transparent',
        color: danger ? 'var(--slides-danger)' : active ? '#f97316' : 'var(--slides-text-muted)',
      }}
    >
      <Icon size={14} />
      {hasDropdown && <ChevronDown size={10} />}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: 'var(--slides-border)' }} />;
}
