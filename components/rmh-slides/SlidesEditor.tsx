'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSlidesStore } from '@/lib/store/useSlidesStore';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import SlidePanel from './SlidePanel';
import SlideCanvas from './SlideCanvas';
import PropertiesPanel from './PropertiesPanel';
import SlideToolbar from './SlideToolbar';
import PresenterMode from './PresenterMode';
import type { DocumentInfo } from '@/lib/rmh-utils/types';
import type { SlideElement, SlideData, TransitionType } from './types';

interface Props {
  document: DocumentInfo;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
}

interface SlidesContent {
  slideOrder: string[];
  slides: Record<string, SlideData>;
}

export default function SlidesEditor({
  document: doc,
  onBack,
  onRename,
  onToggleFavorite,
}: Props) {
  const {
    selectedSlideId, setSelectedSlideId,
    selectedElementId, setSelectedElementId,
    showProperties, showSlidePanel,
    presenterMode, setPresenterMode,
  } = useSlidesStore();

  const { getDocument, updateDocument } = useDocumentStore();

  const [slides, setSlides] = useState<SlideData[]>([]);
  const [slideOrder, setSlideOrder] = useState<string[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(false);

  // Save slides data to store (debounced)
  const saveToStore = useCallback((order: string[], slidesData: SlideData[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const slidesMap: Record<string, SlideData> = {};
      slidesData.forEach((s) => { slidesMap[s.id] = s; });
      const content: SlidesContent = { slideOrder: order, slides: slidesMap };
      updateDocument(doc.id, { content: JSON.stringify(content) });
    }, 300);
  }, [doc.id, updateDocument]);

  // Load from store on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const storedDoc = getDocument(doc.id);
    let loadedSlides: SlideData[] = [];
    let loadedOrder: string[] = [];

    if (storedDoc?.content) {
      try {
        const parsed: SlidesContent = JSON.parse(storedDoc.content);
        loadedOrder = parsed.slideOrder || [];
        loadedSlides = loadedOrder
          .map((id) => parsed.slides[id])
          .filter(Boolean);
      } catch {
        // Invalid content, start fresh
      }
    }

    // Initialize first slide if empty (new document)
    if (loadedSlides.length === 0) {
      const slideId = 'slide_' + Math.random().toString(36).substring(2, 11);
      const titleId = 'el_' + Math.random().toString(36).substring(2, 11);
      const subId = 'el_' + Math.random().toString(36).substring(2, 11);

      const firstSlide: SlideData = {
        id: slideId,
        elements: [
          {
            id: titleId,
            type: 'text',
            x: 10, y: 30, width: 80, height: 20, rotation: 0,
            content: '<h1 style="text-align: center">Presentation Title</h1>',
            zIndex: 1,
            style: { fontSize: 48, textAlign: 'center', color: '#ffffff' },
          },
          {
            id: subId,
            type: 'text',
            x: 20, y: 55, width: 60, height: 10, rotation: 0,
            content: '<p style="text-align: center">Subtitle goes here</p>',
            zIndex: 2,
            style: { fontSize: 24, textAlign: 'center', color: '#a0a0a0' },
          },
        ],
        background: '#1a1a2e',
        transition: 'none',
        notes: '',
        layout: 'title',
      };

      loadedSlides = [firstSlide];
      loadedOrder = [slideId];
    }

    setSlides(loadedSlides);
    setSlideOrder(loadedOrder);

    if (loadedOrder.length > 0 && !selectedSlideId) {
      setSelectedSlideId(loadedOrder[0]);
    }
  }, [doc.id, getDocument, selectedSlideId, setSelectedSlideId]);

  // Cleanup save timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Helper to update state and save
  const updateAndSave = useCallback((newOrder: string[], newSlides: SlideData[]) => {
    setSlideOrder(newOrder);
    setSlides(newSlides);
    saveToStore(newOrder, newSlides);
  }, [saveToStore]);

  // ── Slide CRUD ──
  const addSlide = useCallback((afterSlideId?: string, layoutElements?: SlideElement[]) => {
    const slideId = 'slide_' + Math.random().toString(36).substring(2, 11);
    const newSlide: SlideData = {
      id: slideId,
      elements: layoutElements || [],
      background: '#1a1a2e',
      transition: 'none',
      notes: '',
      layout: 'blank',
    };

    let newOrder: string[];
    if (afterSlideId) {
      const idx = slideOrder.indexOf(afterSlideId);
      newOrder = [...slideOrder];
      if (idx >= 0) {
        newOrder.splice(idx + 1, 0, slideId);
      } else {
        newOrder.push(slideId);
      }
    } else {
      newOrder = [...slideOrder, slideId];
    }

    updateAndSave(newOrder, [...slides, newSlide]);
    setSelectedSlideId(slideId);
  }, [slideOrder, slides, updateAndSave, setSelectedSlideId]);

  const deleteSlide = useCallback((slideId: string) => {
    if (slideOrder.length <= 1) return;

    const newOrder = slideOrder.filter((id) => id !== slideId);
    const newSlides = slides.filter((s) => s.id !== slideId);

    if (selectedSlideId === slideId) {
      const idx = slideOrder.indexOf(slideId);
      const newIdx = Math.min(idx, newOrder.length - 1);
      setSelectedSlideId(newOrder[newIdx] || null);
    }

    updateAndSave(newOrder, newSlides);
  }, [slideOrder, slides, selectedSlideId, setSelectedSlideId, updateAndSave]);

  const duplicateSlide = useCallback((slideId: string) => {
    const sourceSlide = slides.find((s) => s.id === slideId);
    if (!sourceSlide) return;

    const newId = 'slide_' + Math.random().toString(36).substring(2, 11);
    const newSlide: SlideData = {
      ...sourceSlide,
      id: newId,
      elements: sourceSlide.elements.map((el) => ({
        ...el,
        id: 'el_' + Math.random().toString(36).substring(2, 11),
      })),
    };

    const idx = slideOrder.indexOf(slideId);
    const newOrder = [...slideOrder];
    newOrder.splice(idx + 1, 0, newId);

    updateAndSave(newOrder, [...slides, newSlide]);
    setSelectedSlideId(newId);
  }, [slides, slideOrder, updateAndSave, setSelectedSlideId]);

  const reorderSlides = useCallback((newOrder: string[]) => {
    updateAndSave(newOrder, slides);
  }, [slides, updateAndSave]);

  const updateSlideBackground = useCallback((slideId: string, color: string) => {
    const newSlides = slides.map((s) =>
      s.id === slideId ? { ...s, background: color } : s
    );
    updateAndSave(slideOrder, newSlides);
  }, [slides, slideOrder, updateAndSave]);

  const updateSlideTransition = useCallback((slideId: string, transition: TransitionType) => {
    const newSlides = slides.map((s) =>
      s.id === slideId ? { ...s, transition } : s
    );
    updateAndSave(slideOrder, newSlides);
  }, [slides, slideOrder, updateAndSave]);

  const updateSlideNotes = useCallback((slideId: string, notes: string) => {
    const newSlides = slides.map((s) =>
      s.id === slideId ? { ...s, notes } : s
    );
    updateAndSave(slideOrder, newSlides);
  }, [slides, slideOrder, updateAndSave]);

  // ── Element CRUD ──
  const addElement = useCallback((slideId: string, element: SlideElement) => {
    const newSlides = slides.map((s) =>
      s.id === slideId ? { ...s, elements: [...s.elements, element] } : s
    );
    updateAndSave(slideOrder, newSlides);
    setSelectedElementId(element.id);
  }, [slides, slideOrder, updateAndSave, setSelectedElementId]);

  const updateElement = useCallback((slideId: string, elementId: string, updates: Partial<SlideElement>) => {
    const newSlides = slides.map((s) => {
      if (s.id !== slideId) return s;
      return {
        ...s,
        elements: s.elements.map((el) =>
          el.id === elementId ? { ...el, ...updates, style: updates.style ? { ...el.style, ...updates.style } : el.style } : el
        ),
      };
    });
    updateAndSave(slideOrder, newSlides);
  }, [slides, slideOrder, updateAndSave]);

  const deleteElement = useCallback((slideId: string, elementId: string) => {
    const newSlides = slides.map((s) =>
      s.id === slideId ? { ...s, elements: s.elements.filter((el) => el.id !== elementId) } : s
    );
    updateAndSave(slideOrder, newSlides);
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
  }, [slides, slideOrder, updateAndSave, selectedElementId, setSelectedElementId]);

  const duplicateElement = useCallback((slideId: string, elementId: string) => {
    const currentSlide = slides.find((s) => s.id === slideId);
    if (!currentSlide) return;
    const el = currentSlide.elements.find((e) => e.id === elementId);
    if (!el) return;

    const newEl: SlideElement = {
      ...el,
      id: 'el_' + Math.random().toString(36).substring(2, 11),
      x: Math.min(el.x + 3, 90),
      y: Math.min(el.y + 3, 90),
      zIndex: Math.max(...currentSlide.elements.map((e) => e.zIndex), 0) + 1,
    };
    addElement(slideId, newEl);
  }, [slides, addElement]);

  const bringForward = useCallback((slideId: string, elementId: string) => {
    const currentSlide = slides.find((s) => s.id === slideId);
    if (!currentSlide) return;
    const maxZ = Math.max(...currentSlide.elements.map((e) => e.zIndex), 0);
    updateElement(slideId, elementId, { zIndex: maxZ + 1 });
  }, [slides, updateElement]);

  const sendBackward = useCallback((slideId: string, elementId: string) => {
    const currentSlide = slides.find((s) => s.id === slideId);
    if (!currentSlide) return;
    const minZ = Math.min(...currentSlide.elements.map((e) => e.zIndex), 0);
    updateElement(slideId, elementId, { zIndex: minZ - 1 });
  }, [slides, updateElement]);

  const currentSlide = slides.find((s) => s.id === selectedSlideId) || null;
  const currentElement = currentSlide?.elements.find((e) => e.id === selectedElementId) || null;

  if (presenterMode) {
    return (
      <PresenterMode
        slides={slides}
        slideOrder={slideOrder}
        initialSlideId={selectedSlideId}
        onExit={() => setPresenterMode(false)}
      />
    );
  }

  return (
    <div className="slides-theme flex flex-col h-screen" style={{ background: 'var(--slides-bg)', color: 'var(--slides-text)', fontFamily: 'var(--slides-font)' }}>
      {/* Header */}
      <DocumentHeader
        title={doc.title}
        isFavorite={doc.isFavorite}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        accentColor="#f97316"
      />

      {/* Toolbar */}
      <SlideToolbar
        slideId={selectedSlideId}
        selectedElement={currentElement}
        onAddElement={(el) => selectedSlideId && addElement(selectedSlideId, el)}
        onUpdateElement={(updates) => selectedSlideId && selectedElementId && updateElement(selectedSlideId, selectedElementId, updates)}
        onDeleteElement={() => selectedSlideId && selectedElementId && deleteElement(selectedSlideId, selectedElementId)}
        onDuplicateElement={() => selectedSlideId && selectedElementId && duplicateElement(selectedSlideId, selectedElementId)}
        onBringForward={() => selectedSlideId && selectedElementId && bringForward(selectedSlideId, selectedElementId)}
        onSendBackward={() => selectedSlideId && selectedElementId && sendBackward(selectedSlideId, selectedElementId)}
        onPresent={() => setPresenterMode(true)}
        maxZIndex={currentSlide ? Math.max(...currentSlide.elements.map((e) => e.zIndex), 0) : 0}
      />

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Slide panel */}
        {showSlidePanel && (
          <SlidePanel
            slides={slides}
            slideOrder={slideOrder}
            selectedSlideId={selectedSlideId}
            onSelectSlide={setSelectedSlideId}
            onAddSlide={addSlide}
            onDeleteSlide={deleteSlide}
            onDuplicateSlide={duplicateSlide}
            onReorderSlides={reorderSlides}
          />
        )}

        {/* Center: Canvas */}
        <SlideCanvas
          slide={currentSlide}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={(elId, updates) => selectedSlideId && updateElement(selectedSlideId, elId, updates)}
          onDeleteElement={(elId) => selectedSlideId && deleteElement(selectedSlideId, elId)}
        />

        {/* Right: Properties panel */}
        {showProperties && (
          <PropertiesPanel
            slide={currentSlide}
            selectedElement={currentElement}
            onUpdateElement={(updates) => selectedSlideId && selectedElementId && updateElement(selectedSlideId, selectedElementId, updates)}
            onUpdateSlideBackground={(color) => selectedSlideId && updateSlideBackground(selectedSlideId, color)}
            onUpdateSlideTransition={(t) => selectedSlideId && updateSlideTransition(selectedSlideId, t)}
            onUpdateSlideNotes={(notes) => selectedSlideId && updateSlideNotes(selectedSlideId, notes)}
          />
        )}
      </div>
    </div>
  );
}
