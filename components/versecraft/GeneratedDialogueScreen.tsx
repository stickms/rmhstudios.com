'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { Sprite } from './Sprite';
import { asset } from '@/lib/storage/asset';
import type { GenNode, GenScene, Emotion } from '@/lib/versecraft/gen/world-types';

const BG_BASE = asset('/sprites/versecraft/backgrounds');

const TIME_FILTERS: Record<string, string> = {
  morning: 'brightness(1.08) saturate(0.95)',
  afternoon: 'brightness(1.0)',
  evening: 'brightness(0.82) saturate(0.8) sepia(0.15)',
  night: 'brightness(0.55) saturate(0.65) hue-rotate(200deg)',
};

function bgImage(env: string, time: string): string {
  // Existing assets are named "<env>_day.png" with some evening/night variants.
  const variant = (time === 'evening' || time === 'night') ? time : 'day';
  return `${BG_BASE}/${env}_${variant}.png`;
}

function Typewriter({ text, speed, onDone, skipRef }: {
  text: string; speed: number; onDone: () => void;
  skipRef: React.MutableRefObject<(() => boolean) | null>;
}) {
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => { setN(0); setDone(false); }, [text]);
  useEffect(() => {
    if (n >= text.length) { if (!done) { setDone(true); onDone(); } return; }
    const t = setTimeout(() => setN(v => v + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed, onDone, done]);
  useEffect(() => {
    skipRef.current = () => { if (!done) { setN(text.length); return true; } return false; };
    return () => { skipRef.current = null; };
  }, [done, text.length, skipRef]);
  return <span>{text.slice(0, n)}{!done && <span className="animate-pulse">|</span>}</span>;
}

export function GeneratedDialogueScreen() {
  const world = useGameStore(s => s.world);
  const chapters = useGameStore(s => s.generatedChapters);
  const chapterIndex = useGameStore(s => s.currentChapterIndex);
  const sceneIndex = useGameStore(s => s.currentSceneIndex);
  const dialogueIndex = useGameStore(s => s.currentDialogueIndex);
  const settings = useGameStore(s => s.settings);
  const advanceDialogue = useGameStore(s => s.advanceDialogue);
  const setSceneIndex = useGameStore(s => s.setSceneIndex);
  const genApplyChoice = useGameStore(s => s.genApplyChoice);
  const advanceGeneratedChapter = useGameStore(s => s.advanceGeneratedChapter);
  const genLoading = useGameStore(s => s.genLoading);
  const setScreen = useGameStore(s => s.setScreen);

  const [textComplete, setTextComplete] = useState(false);
  const skipRef = useRef<(() => boolean) | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ob = new ResizeObserver((es) => {
      for (const e of es) setBoxH(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height);
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  const chapter = chapters[chapterIndex];
  const scene = chapter?.scenes[sceneIndex] as GenScene | undefined;
  const node = scene?.nodes[dialogueIndex] as GenNode | undefined;

  const charById = useCallback((id: string | null) =>
    id ? world?.characters.find(c => c.id === id) ?? null : null, [world]);

  const textSpeed = settings.textSpeed === 'instant' ? 0
    : settings.textSpeed === 'fast' ? 12
    : settings.textSpeed === 'slow' ? 48 : 26;

  const handleClick = useCallback(() => {
    if (!scene || !node || node.choices) return;
    if (skipRef.current?.()) return;
    if (!textComplete) return;
    const nextNode = dialogueIndex + 1;
    if (nextNode < scene.nodes.length) {
      advanceDialogue();
      setTextComplete(false);
    } else if (sceneIndex + 1 < (chapter?.scenes.length ?? 0)) {
      setSceneIndex(sceneIndex + 1);
      setTextComplete(false);
    } else {
      void advanceGeneratedChapter();
      setTextComplete(false);
    }
  }, [scene, node, dialogueIndex, sceneIndex, chapter, textComplete, advanceDialogue, setSceneIndex, advanceGeneratedChapter]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleClick(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleClick]);

  const speaker = charById(node?.speaker ?? null);
  const speakerColor = speaker?.color ?? '#c4a35a';

  if (!world || !chapter || !scene || !node) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>Composing your story…</p>
      </div>
    );
  }

  const filter = TIME_FILTERS[scene.timeOfDay] ?? '';

  return (
    <div className="relative w-full min-h-screen overflow-hidden cursor-pointer" onClick={handleClick}>
      {/* Chapter-transition overlay */}
      <AnimatePresence>
        {genLoading && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(19,16,26,0.85)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.span
              className="text-xl tracking-wide" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}
              animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }}
            >
              Turning the page…
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background */}
      <div className="absolute inset-0 z-0 transition-all duration-1000" style={{ backgroundColor: '#1a1520', filter }}>
        <img
          src={bgImage(scene.environment, scene.timeOfDay)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Sprites */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {scene.charactersPresent.map((id, i) => {
            const c = charById(id);
            if (!c) return null;
            const position = scene.charactersPresent.length === 1
              ? 'center' as const
              : i === 0 ? 'left' as const : i === 1 ? 'right' as const : 'center' as const;
            const speaking = node.speaker === id;
            const emotion: Emotion = speaking && node.emotion ? node.emotion : c.emotionalDefault;
            return (
              <Sprite
                key={id}
                packId={c.packId}
                emotion={emotion}
                position={position}
                isSpeaking={speaking}
                accent={c.color}
                dialogueBoxHeight={boxH}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Dialogue box */}
      <div ref={boxRef} className="absolute bottom-0 left-0 right-0 z-20 p-4 md:p-6">
        <motion.div
          className="max-w-4xl mx-auto rounded-lg p-4 md:p-6"
          style={{
            backgroundColor: 'rgba(26, 21, 32, 0.92)',
            border: '1px solid rgba(196, 163, 90, 0.25)',
            backdropFilter: 'blur(8px)',
          }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={node.id}
        >
          {speaker && (
            <div
              className="inline-block px-3 py-1 rounded-sm text-sm font-semibold mb-2"
              style={{ backgroundColor: `${speakerColor}25`, border: `1px solid ${speakerColor}50`, color: speakerColor, fontFamily: 'var(--font-playfair, serif)' }}
            >
              {speaker.name}
            </div>
          )}
          <div
            className="text-base md:text-lg leading-relaxed min-h-[3em]"
            style={{
              fontFamily: speaker ? 'var(--font-nunito, sans-serif)' : 'var(--font-eb-garamond, serif)',
              color: speaker ? '#e8e0d0' : '#a89888',
              fontStyle: speaker ? 'normal' : 'italic',
            }}
          >
            <Typewriter text={node.text} speed={textSpeed} onDone={() => setTextComplete(true)} skipRef={skipRef} />
          </div>

          <AnimatePresence>
            {node.choices && textComplete && (
              <motion.div className="mt-4 space-y-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                {node.choices.map((choice, i) => (
                  <motion.button
                    key={i}
                    className="w-full text-left px-4 py-2.5 rounded transition-all text-sm md:text-base"
                    style={{ backgroundColor: 'rgba(42, 34, 53, 0.6)', border: '1px solid rgba(196, 163, 90, 0.15)', color: '#e8e0d0' }}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }}
                    whileHover={{ backgroundColor: 'rgba(196, 163, 90, 0.15)', borderColor: 'rgba(196, 163, 90, 0.4)', x: 5 }}
                    onClick={(e) => { e.stopPropagation(); genApplyChoice(choice); setTextComplete(false); }}
                  >
                    {choice.tone === 'flirt' && <span className="mr-2 text-pink-400">♥</span>}
                    <span className="mr-2" style={{ color: '#c4a35a' }}>▸</span>
                    {choice.text}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {!node.choices && (
            <div className="text-right mt-2 h-5">
              {textComplete && (
                <motion.span className="text-xs" style={{ color: '#c4a35a' }} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  ▸ Click to continue
                </motion.span>
              )}
            </div>
          )}
        </motion.div>

        {/* Action bar */}
        <div className="max-w-4xl mx-auto mt-2 flex gap-2 justify-between items-center">
          <span className="text-xs" style={{ color: '#555' }}>
            {world.title} · Ch.{chapterIndex + 1}/{world.routePlan.totalChapters} · seed {world.seed}
          </span>
          <div className="flex gap-2">
            {(['menu', 'settings', 'progress'] as const).map(k => (
              <button
                key={k}
                onClick={(e) => { e.stopPropagation(); setScreen(k); }}
                className="text-xs px-3 py-1 rounded transition-all hover:brightness-125"
                style={{ backgroundColor: 'rgba(26, 21, 32, 0.7)', border: '1px solid rgba(196, 163, 90, 0.1)', color: '#888' }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
