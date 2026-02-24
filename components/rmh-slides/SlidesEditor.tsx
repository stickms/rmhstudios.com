'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { useCollaboration } from '@/lib/rmh-utils/useCollaboration';
import { useSlidesStore } from '@/lib/store/useSlidesStore';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import ShareDialog from '@/components/rmh-utils/ShareDialog';
import SlidePanel from './SlidePanel';
import SlideCanvas from './SlideCanvas';
import PropertiesPanel from './PropertiesPanel';
import SlideToolbar from './SlideToolbar';
import PresenterMode from './PresenterMode';
import type { DocumentInfo, CollaboratorRole } from '@/lib/rmh-utils/types';
import type { SlideElement, SlideData, TransitionType } from './types';

interface Props {
  document: DocumentInfo;
  user: { id: string; name: string | null; image: string | null };
  sessionToken: string;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
  onAddCollaborator: (username: string, role: CollaboratorRole) => Promise<boolean>;
  onRemoveCollaborator: (userId: string) => Promise<void>;
}

export default function SlidesEditor({
  document: doc,
  user,
  sessionToken,
  onBack,
  onRename,
  onToggleFavorite,
  onAddCollaborator,
  onRemoveCollaborator,
}: Props) {
  const { yDoc, connected, collaborators } = useCollaboration({
    documentId: doc.id,
    roomPrefix: 'slide',
    user,
    sessionToken,
  });

  const {
    selectedSlideId, setSelectedSlideId,
    selectedElementId, setSelectedElementId,
    showProperties, showSlidePanel,
    presenterMode, setPresenterMode,
  } = useSlidesStore();

  const [shareOpen, setShareOpen] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [slideOrder, setSlideOrder] = useState<string[]>([]);
  const initRef = useRef(false);

  // Sync Y.js data to local state
  const syncFromYjs = useCallback(() => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    const ySlides = yDoc.getMap('slides');
    const order = ySlideOrder.toArray();
    setSlideOrder(order);

    const slidesData: SlideData[] = order.map((slideId) => {
      const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
      if (!ySlide) {
        return {
          id: slideId,
          elements: [],
          background: '#1a1a2e',
          transition: 'none' as TransitionType,
          notes: '',
          layout: 'blank',
        };
      }

      const yElements = ySlide.get('elements') as Y.Map<unknown> | undefined;
      const elements: SlideElement[] = [];
      if (yElements) {
        yElements.forEach((value, key) => {
          const el = value as Y.Map<unknown>;
          const styleMap = el.get('style') as Y.Map<unknown> | undefined;
          const style: Record<string, unknown> = {};
          if (styleMap) {
            styleMap.forEach((v, k) => { style[k] = v; });
          }
          elements.push({
            id: key,
            type: (el.get('type') as string) as SlideElement['type'],
            x: el.get('x') as number,
            y: el.get('y') as number,
            width: el.get('width') as number,
            height: el.get('height') as number,
            rotation: (el.get('rotation') as number) || 0,
            content: (el.get('content') as string) || '',
            zIndex: (el.get('zIndex') as number) || 0,
            style: style as SlideElement['style'],
          });
        });
      }

      elements.sort((a, b) => a.zIndex - b.zIndex);

      return {
        id: slideId,
        elements,
        background: (ySlide.get('background') as string) || '#1a1a2e',
        transition: ((ySlide.get('transition') as string) || 'none') as TransitionType,
        notes: (ySlide.get('notes') as string) || '',
        layout: (ySlide.get('layout') as string) || 'blank',
      };
    });

    setSlides(slidesData);
  }, [yDoc]);

  // Initialize Y.js listeners and first slide
  useEffect(() => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    const ySlides = yDoc.getMap('slides');

    // Initial sync with delay to allow provider to load
    const timer = setTimeout(() => {
      // Initialize first slide if empty (new document)
      if (ySlideOrder.length === 0 && !initRef.current) {
        initRef.current = true;
        yDoc.transact(() => {
          const slideId = 'slide_' + Math.random().toString(36).substring(2, 11);
          ySlideOrder.push([slideId]);

          const ySlide = new Y.Map();
          ySlide.set('background', '#1a1a2e');
          ySlide.set('transition', 'none');
          ySlide.set('notes', '');
          ySlide.set('layout', 'title');
          const yElements = new Y.Map();

          // Add title layout elements
          const titleId = 'el_' + Math.random().toString(36).substring(2, 11);
          const titleEl = new Y.Map();
          titleEl.set('type', 'text');
          titleEl.set('x', 10);
          titleEl.set('y', 30);
          titleEl.set('width', 80);
          titleEl.set('height', 20);
          titleEl.set('rotation', 0);
          titleEl.set('content', '<h1 style="text-align: center">Presentation Title</h1>');
          titleEl.set('zIndex', 1);
          const titleStyle = new Y.Map();
          titleStyle.set('fontSize', 48);
          titleStyle.set('textAlign', 'center');
          titleStyle.set('color', '#ffffff');
          titleEl.set('style', titleStyle);
          yElements.set(titleId, titleEl);

          const subId = 'el_' + Math.random().toString(36).substring(2, 11);
          const subEl = new Y.Map();
          subEl.set('type', 'text');
          subEl.set('x', 20);
          subEl.set('y', 55);
          subEl.set('width', 60);
          subEl.set('height', 10);
          subEl.set('rotation', 0);
          subEl.set('content', '<p style="text-align: center">Subtitle goes here</p>');
          subEl.set('zIndex', 2);
          const subStyle = new Y.Map();
          subStyle.set('fontSize', 24);
          subStyle.set('textAlign', 'center');
          subStyle.set('color', '#a0a0a0');
          subEl.set('style', subStyle);
          yElements.set(subId, subEl);

          ySlide.set('elements', yElements);
          ySlides.set(slideId, ySlide);
        });
      } else if (ySlideOrder.length > 0) {
        initRef.current = true;
      }

      syncFromYjs();

      // Select first slide if none selected
      if (ySlideOrder.length > 0 && !selectedSlideId) {
        setSelectedSlideId(ySlideOrder.get(0));
      }
    }, 200);

    const observer = () => syncFromYjs();
    ySlideOrder.observe(observer);
    ySlides.observeDeep(observer);

    return () => {
      clearTimeout(timer);
      ySlideOrder.unobserve(observer);
      ySlides.unobserveDeep(observer);
    };
  }, [yDoc, syncFromYjs, selectedSlideId, setSelectedSlideId]);

  // ── Slide CRUD ──
  const addSlide = useCallback((afterSlideId?: string, layoutElements?: SlideElement[]) => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    const ySlides = yDoc.getMap('slides');
    const slideId = 'slide_' + Math.random().toString(36).substring(2, 11);

    yDoc.transact(() => {
      if (afterSlideId) {
        const order = ySlideOrder.toArray();
        const idx = order.indexOf(afterSlideId);
        if (idx >= 0) {
          ySlideOrder.insert(idx + 1, [slideId]);
        } else {
          ySlideOrder.push([slideId]);
        }
      } else {
        ySlideOrder.push([slideId]);
      }

      const ySlide = new Y.Map();
      ySlide.set('background', '#1a1a2e');
      ySlide.set('transition', 'none');
      ySlide.set('notes', '');
      ySlide.set('layout', 'blank');
      const yElements = new Y.Map();

      if (layoutElements) {
        layoutElements.forEach((el) => {
          const yEl = new Y.Map();
          yEl.set('type', el.type);
          yEl.set('x', el.x);
          yEl.set('y', el.y);
          yEl.set('width', el.width);
          yEl.set('height', el.height);
          yEl.set('rotation', el.rotation);
          yEl.set('content', el.content);
          yEl.set('zIndex', el.zIndex);
          const yStyle = new Y.Map();
          Object.entries(el.style).forEach(([k, v]) => yStyle.set(k, v));
          yEl.set('style', yStyle);
          yElements.set(el.id, yEl);
        });
      }

      ySlide.set('elements', yElements);
      ySlides.set(slideId, ySlide);
    });

    setSelectedSlideId(slideId);
  }, [yDoc, setSelectedSlideId]);

  const deleteSlide = useCallback((slideId: string) => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    const ySlides = yDoc.getMap('slides');

    if (ySlideOrder.length <= 1) return; // Keep at least one slide

    yDoc.transact(() => {
      const order = ySlideOrder.toArray();
      const idx = order.indexOf(slideId);
      if (idx >= 0) {
        ySlideOrder.delete(idx, 1);
        ySlides.delete(slideId);
      }

      // Select adjacent slide
      if (selectedSlideId === slideId) {
        const newOrder = ySlideOrder.toArray();
        const newIdx = Math.min(idx, newOrder.length - 1);
        setSelectedSlideId(newOrder[newIdx] || null);
      }
    });
  }, [yDoc, selectedSlideId, setSelectedSlideId]);

  const duplicateSlide = useCallback((slideId: string) => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    const ySlides = yDoc.getMap('slides');
    const sourceSlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (!sourceSlide) return;

    const newId = 'slide_' + Math.random().toString(36).substring(2, 11);

    yDoc.transact(() => {
      const order = ySlideOrder.toArray();
      const idx = order.indexOf(slideId);
      ySlideOrder.insert(idx + 1, [newId]);

      const ySlide = new Y.Map();
      ySlide.set('background', sourceSlide.get('background'));
      ySlide.set('transition', sourceSlide.get('transition'));
      ySlide.set('notes', sourceSlide.get('notes'));
      ySlide.set('layout', sourceSlide.get('layout'));

      const yElements = new Y.Map();
      const sourceElements = sourceSlide.get('elements') as Y.Map<unknown> | undefined;
      if (sourceElements) {
        sourceElements.forEach((value, _key) => {
          const srcEl = value as Y.Map<unknown>;
          const newElId = 'el_' + Math.random().toString(36).substring(2, 11);
          const yEl = new Y.Map();
          yEl.set('type', srcEl.get('type'));
          yEl.set('x', srcEl.get('x'));
          yEl.set('y', srcEl.get('y'));
          yEl.set('width', srcEl.get('width'));
          yEl.set('height', srcEl.get('height'));
          yEl.set('rotation', srcEl.get('rotation'));
          yEl.set('content', srcEl.get('content'));
          yEl.set('zIndex', srcEl.get('zIndex'));

          const srcStyle = srcEl.get('style') as Y.Map<unknown> | undefined;
          const yStyle = new Y.Map();
          if (srcStyle) {
            srcStyle.forEach((v, k) => yStyle.set(k, v));
          }
          yEl.set('style', yStyle);
          yElements.set(newElId, yEl);
        });
      }

      ySlide.set('elements', yElements);
      ySlides.set(newId, ySlide);
    });

    setSelectedSlideId(newId);
  }, [yDoc, setSelectedSlideId]);

  const reorderSlides = useCallback((newOrder: string[]) => {
    const ySlideOrder = yDoc.getArray<string>('slideOrder');
    yDoc.transact(() => {
      ySlideOrder.delete(0, ySlideOrder.length);
      ySlideOrder.push(newOrder);
    });
  }, [yDoc]);

  const updateSlideBackground = useCallback((slideId: string, color: string) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (ySlide) {
      ySlide.set('background', color);
    }
  }, [yDoc]);

  const updateSlideTransition = useCallback((slideId: string, transition: TransitionType) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (ySlide) {
      ySlide.set('transition', transition);
    }
  }, [yDoc]);

  const updateSlideNotes = useCallback((slideId: string, notes: string) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (ySlide) {
      ySlide.set('notes', notes);
    }
  }, [yDoc]);

  // ── Element CRUD ──
  const addElement = useCallback((slideId: string, element: SlideElement) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (!ySlide) return;

    const yElements = ySlide.get('elements') as Y.Map<unknown>;
    yDoc.transact(() => {
      const yEl = new Y.Map();
      yEl.set('type', element.type);
      yEl.set('x', element.x);
      yEl.set('y', element.y);
      yEl.set('width', element.width);
      yEl.set('height', element.height);
      yEl.set('rotation', element.rotation);
      yEl.set('content', element.content);
      yEl.set('zIndex', element.zIndex);
      const yStyle = new Y.Map();
      Object.entries(element.style).forEach(([k, v]) => yStyle.set(k, v));
      yEl.set('style', yStyle);
      yElements.set(element.id, yEl);
    });

    setSelectedElementId(element.id);
  }, [yDoc, setSelectedElementId]);

  const updateElement = useCallback((slideId: string, elementId: string, updates: Partial<SlideElement>) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (!ySlide) return;

    const yElements = ySlide.get('elements') as Y.Map<unknown>;
    const yEl = yElements.get(elementId) as Y.Map<unknown> | undefined;
    if (!yEl) return;

    yDoc.transact(() => {
      if (updates.x !== undefined) yEl.set('x', updates.x);
      if (updates.y !== undefined) yEl.set('y', updates.y);
      if (updates.width !== undefined) yEl.set('width', updates.width);
      if (updates.height !== undefined) yEl.set('height', updates.height);
      if (updates.rotation !== undefined) yEl.set('rotation', updates.rotation);
      if (updates.content !== undefined) yEl.set('content', updates.content);
      if (updates.zIndex !== undefined) yEl.set('zIndex', updates.zIndex);
      if (updates.style !== undefined) {
        const yStyle = yEl.get('style') as Y.Map<unknown>;
        if (yStyle) {
          Object.entries(updates.style).forEach(([k, v]) => yStyle.set(k, v));
        }
      }
    });
  }, [yDoc]);

  const deleteElement = useCallback((slideId: string, elementId: string) => {
    const ySlides = yDoc.getMap('slides');
    const ySlide = ySlides.get(slideId) as Y.Map<unknown> | undefined;
    if (!ySlide) return;

    const yElements = ySlide.get('elements') as Y.Map<unknown>;
    yElements.delete(elementId);

    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
  }, [yDoc, selectedElementId, setSelectedElementId]);

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
        connected={connected}
        collaborators={collaborators}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        onShare={() => setShareOpen(true)}
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

      {/* Share dialog */}
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={doc.id}
        collaborators={doc.collaborators}
        ownerName={doc.user.name || 'Owner'}
        onAdd={onAddCollaborator}
        onRemove={onRemoveCollaborator}
        accentColor="#f97316"
      />
    </div>
  );
}
