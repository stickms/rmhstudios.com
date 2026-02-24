'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { transitions } from '@/lib/rmh-slides/transitions';
import type { SlideData, SlideElement, TransitionType } from './types';

interface Props {
  slide: SlideData | null;
  selectedElement: SlideElement | null;
  onUpdateElement: (updates: Partial<SlideElement>) => void;
  onUpdateSlideBackground: (color: string) => void;
  onUpdateSlideTransition: (transition: TransitionType) => void;
  onUpdateSlideNotes: (notes: string) => void;
}

export default function PropertiesPanel({
  slide,
  selectedElement,
  onUpdateElement,
  onUpdateSlideBackground,
  onUpdateSlideTransition,
  onUpdateSlideNotes,
}: Props) {
  if (!slide) {
    return (
      <div
        className="flex flex-col h-full border-l"
        style={{
          width: 'var(--slides-properties-width)',
          minWidth: 'var(--slides-properties-width)',
          background: 'var(--slides-surface)',
          borderColor: 'var(--slides-border)',
        }}
      >
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--slides-text-subtle)' }}>
          <p className="text-xs">No slide selected</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full border-l overflow-y-auto"
      style={{
        width: 'var(--slides-properties-width)',
        minWidth: 'var(--slides-properties-width)',
        background: 'var(--slides-surface)',
        borderColor: 'var(--slides-border)',
      }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--slides-border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--slides-text-muted)' }}>
          {selectedElement ? 'ELEMENT' : 'SLIDE'} PROPERTIES
        </span>
      </div>

      <div className="p-3 space-y-4">
        {selectedElement ? (
          <ElementProperties element={selectedElement} onUpdate={onUpdateElement} />
        ) : (
          <SlideProperties
            slide={slide}
            onUpdateBackground={onUpdateSlideBackground}
            onUpdateTransition={onUpdateSlideTransition}
            onUpdateNotes={onUpdateSlideNotes}
          />
        )}
      </div>
    </div>
  );
}

// ── Element Properties ──

function ElementProperties({ element, onUpdate }: { element: SlideElement; onUpdate: (updates: Partial<SlideElement>) => void }) {
  return (
    <>
      {/* Position */}
      <PropertySection title="Position">
        <PropertyRow label="X">
          <NumberInput value={element.x} onChange={(v) => onUpdate({ x: v })} min={-50} max={150} step={0.5} />
        </PropertyRow>
        <PropertyRow label="Y">
          <NumberInput value={element.y} onChange={(v) => onUpdate({ y: v })} min={-50} max={150} step={0.5} />
        </PropertyRow>
      </PropertySection>

      {/* Size */}
      <PropertySection title="Size">
        <PropertyRow label="W">
          <NumberInput value={element.width} onChange={(v) => onUpdate({ width: v })} min={1} max={200} step={0.5} />
        </PropertyRow>
        <PropertyRow label="H">
          <NumberInput value={element.height} onChange={(v) => onUpdate({ height: v })} min={1} max={200} step={0.5} />
        </PropertyRow>
      </PropertySection>

      {/* Rotation */}
      <PropertySection title="Rotation">
        <PropertyRow label="Deg">
          <NumberInput value={element.rotation} onChange={(v) => onUpdate({ rotation: v })} min={-360} max={360} step={1} />
        </PropertyRow>
      </PropertySection>

      {/* Type-specific properties */}
      {element.type === 'text' && (
        <TextProperties element={element} onUpdate={onUpdate} />
      )}

      {element.type === 'shape' && (
        <ShapeProperties element={element} onUpdate={onUpdate} />
      )}

      {element.type === 'image' && (
        <ImageProperties element={element} onUpdate={onUpdate} />
      )}
    </>
  );
}

function TextProperties({ element, onUpdate }: { element: SlideElement; onUpdate: (updates: Partial<SlideElement>) => void }) {
  return (
    <PropertySection title="Text">
      <PropertyRow label="Size">
        <NumberInput
          value={element.style.fontSize || 20}
          onChange={(v) => onUpdate({ style: { ...element.style, fontSize: v } })}
          min={8}
          max={200}
          step={1}
        />
      </PropertyRow>
      <PropertyRow label="Color">
        <input
          type="color"
          value={element.style.color || '#ffffff'}
          onChange={(e) => onUpdate({ style: { ...element.style, color: e.target.value } })}
          className="w-full h-7 rounded cursor-pointer border-0 p-0"
        />
      </PropertyRow>
      <PropertyRow label="Align">
        <select
          value={element.style.textAlign || 'left'}
          onChange={(e) => onUpdate({ style: { ...element.style, textAlign: e.target.value as 'left' | 'center' | 'right' } })}
          className="w-full text-xs rounded px-1 py-1"
          style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </PropertyRow>
    </PropertySection>
  );
}

function ShapeProperties({ element, onUpdate }: { element: SlideElement; onUpdate: (updates: Partial<SlideElement>) => void }) {
  return (
    <PropertySection title="Shape">
      <PropertyRow label="Fill">
        <input
          type="color"
          value={element.style.fill || '#f97316'}
          onChange={(e) => onUpdate({ style: { ...element.style, fill: e.target.value } })}
          className="w-full h-7 rounded cursor-pointer border-0 p-0"
        />
      </PropertyRow>
      <PropertyRow label="Stroke">
        <input
          type="color"
          value={element.style.stroke || '#000000'}
          onChange={(e) => onUpdate({ style: { ...element.style, stroke: e.target.value } })}
          className="w-full h-7 rounded cursor-pointer border-0 p-0"
        />
      </PropertyRow>
      <PropertyRow label="Stroke W">
        <NumberInput
          value={element.style.strokeWidth || 0}
          onChange={(v) => onUpdate({ style: { ...element.style, strokeWidth: v } })}
          min={0}
          max={20}
          step={0.5}
        />
      </PropertyRow>
      <PropertyRow label="Radius">
        <NumberInput
          value={element.style.borderRadius || 0}
          onChange={(v) => onUpdate({ style: { ...element.style, borderRadius: v } })}
          min={0}
          max={50}
          step={1}
        />
      </PropertyRow>
    </PropertySection>
  );
}

function ImageProperties({ element, onUpdate }: { element: SlideElement; onUpdate: (updates: Partial<SlideElement>) => void }) {
  return (
    <PropertySection title="Image">
      <PropertyRow label="URL">
        <input
          type="text"
          value={element.content || ''}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="https://..."
          className="w-full text-xs rounded px-2 py-1"
          style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
        />
      </PropertyRow>
      <PropertyRow label="Fit">
        <select
          value={element.style.objectFit || 'cover'}
          onChange={(e) => onUpdate({ style: { ...element.style, objectFit: e.target.value as 'cover' | 'contain' | 'fill' } })}
          className="w-full text-xs rounded px-1 py-1"
          style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
        </select>
      </PropertyRow>
    </PropertySection>
  );
}

// ── Slide Properties ──

function SlideProperties({
  slide,
  onUpdateBackground,
  onUpdateTransition,
  onUpdateNotes,
}: {
  slide: SlideData;
  onUpdateBackground: (color: string) => void;
  onUpdateTransition: (transition: TransitionType) => void;
  onUpdateNotes: (notes: string) => void;
}) {
  return (
    <>
      <PropertySection title="Background">
        <PropertyRow label="Color">
          <input
            type="color"
            value={slide.background}
            onChange={(e) => onUpdateBackground(e.target.value)}
            className="w-full h-7 rounded cursor-pointer border-0 p-0"
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Transition">
        <PropertyRow label="Type">
          <select
            value={slide.transition}
            onChange={(e) => onUpdateTransition(e.target.value as TransitionType)}
            className="w-full text-xs rounded px-1 py-1"
            style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
          >
            {transitions.map((t) => (
              <option key={t.name} value={t.name}>{t.label}</option>
            ))}
          </select>
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Speaker Notes">
        <textarea
          value={slide.notes}
          onChange={(e) => onUpdateNotes(e.target.value)}
          placeholder="Add speaker notes..."
          className="w-full text-xs rounded px-2 py-2 resize-none"
          rows={6}
          style={{
            background: 'var(--slides-surface-3)',
            color: 'var(--slides-text)',
            border: '1px solid var(--slides-border)',
            outline: 'none',
          }}
        />
      </PropertySection>
    </>
  );
}

// ── Shared UI components ──

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-medium mb-2 w-full"
        style={{ color: 'var(--slides-text-muted)' }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="space-y-2 pl-3">{children}</div>}
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-10 flex-shrink-0" style={{ color: 'var(--slides-text-subtle)' }}>{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={Math.round(value * 10) / 10}
      onChange={(e) => {
        let v = parseFloat(e.target.value);
        if (isNaN(v)) v = 0;
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onChange(v);
      }}
      min={min}
      max={max}
      step={step}
      className="w-full text-xs text-center rounded px-1 py-1"
      style={{ background: 'var(--slides-surface-3)', color: 'var(--slides-text)', border: '1px solid var(--slides-border)' }}
    />
  );
}
