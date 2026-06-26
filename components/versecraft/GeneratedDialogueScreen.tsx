'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { Sprite } from './Sprite';
import { ShareSeed } from './ShareSeed';
import { GeneratingState } from './GeneratingState';
import { packSpriteUrls } from '@/lib/versecraft/sprites/registry';

// Module-level cache of already-preloaded sprite URLs (survives re-renders).
const preloadedUrls = new Set<string>();
function preloadPack(packId: string) {
  if (typeof window === 'undefined') return;
  for (const url of packSpriteUrls(packId)) {
    if (preloadedUrls.has(url)) continue;
    preloadedUrls.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}
import { asset } from '@/lib/storage/asset';
import { makePersonalizer } from '@/lib/versecraft/gen/personalize';
import { MC_SPEAKER, type GenNode, type GenScene, type Emotion } from '@/lib/versecraft/gen/world-types';

const BG_BASE = asset('/sprites/versecraft/backgrounds');

// The player's own voice gets a cool, distinct accent so "you talking" never
// reads like a cast member or like the italic inner-thought narration.
const PLAYER_COLOR = '#8fb8de';

const TIME_FILTERS: Record<string, string> = {
  morning: 'brightness(1.08) saturate(0.95)',
  afternoon: 'brightness(1.0)',
  evening: 'brightness(0.82) saturate(0.8) sepia(0.15)',
  night: 'brightness(0.55) saturate(0.65) hue-rotate(200deg)',
};

/** Lighten a hex toward white so name chips stay legible whatever the accent. */
function lighten(hex: string, amt = 0.45): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

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
  const prefetchChapter = useGameStore(s => s.prefetchChapter);
  const shouldRunPoem = useGameStore(s => s.shouldRunPoem);
  const openGenPoem = useGameStore(s => s.openGenPoem);
  const genLoading = useGameStore(s => s.genLoading);
  const setScreen = useGameStore(s => s.setScreen);

  const [textComplete, setTextComplete] = useState(false);
  const [waitingScene, setWaitingScene] = useState(false);
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

  // Warm the next chapter in the background as the player reads this one, so
  // advancing is instant (covers resuming a save mid-route too).
  useEffect(() => {
    if (chapter) prefetchChapter(chapterIndex + 1);
  }, [chapter, chapterIndex, prefetchChapter]);

  // Preload every expression of the characters in this scene so emotion swaps
  // are instant (no flicker). Also warm the whole cast once we have a world.
  useEffect(() => {
    if (!world) return;
    scene?.charactersPresent.forEach(id => {
      const c = world.characters.find(x => x.id === id);
      if (c) preloadPack(c.packId);
    });
  }, [scene, world]);

  useEffect(() => {
    world?.characters.forEach(c => preloadPack(c.packId));
  }, [world]);

  // Recovery: if we land on an invalid position (empty scene/node from a bad
  // generation), skip forward instead of soft-locking on "Composing…".
  useEffect(() => {
    if (!chapter) return;
    if (!scene) {
      // scene index past the end → advance chapter
      if (sceneIndex >= chapter.scenes.length) void advanceGeneratedChapter();
      return;
    }
    if (!node) {
      if (sceneIndex + 1 < chapter.scenes.length) setSceneIndex(sceneIndex + 1);
      else void advanceGeneratedChapter();
    }
  }, [chapter, scene, node, sceneIndex, advanceGeneratedChapter, setSceneIndex]);

  const charById = useCallback((id: string | null) =>
    id ? world?.characters.find(c => c.id === id) ?? null : null, [world]);

  // Replace {mc}/{they}/… tokens with THIS player's name and pronouns at render,
  // so shared/cached worlds still address everyone personally.
  const personalize = useMemo(
    () => makePersonalizer(settings.playerName, settings.playerPronouns, settings.customPronouns),
    [settings.playerName, settings.playerPronouns, settings.customPronouns],
  );

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
    } else if (chapter?.partial) {
      // The rest of this chapter is still streaming in — wait for it.
      setWaitingScene(true);
    } else if (shouldRunPoem()) {
      openGenPoem();
      setTextComplete(false);
    } else {
      void advanceGeneratedChapter();
      setTextComplete(false);
    }
  }, [scene, node, dialogueIndex, sceneIndex, chapter, textComplete, advanceDialogue, setSceneIndex, advanceGeneratedChapter, shouldRunPoem, openGenPoem]);

  // When the streamed remainder of a partial chapter arrives, continue.
  useEffect(() => {
    if (!waitingScene || !chapter) return;
    if (sceneIndex + 1 < chapter.scenes.length) {
      setWaitingScene(false);
      setSceneIndex(sceneIndex + 1);
      setTextComplete(false);
    } else if (!chapter.partial) {
      // No further scenes — treat as chapter end.
      setWaitingScene(false);
      setTextComplete(false);
      if (shouldRunPoem()) openGenPoem();
      else void advanceGeneratedChapter();
    }
  }, [waitingScene, chapter, sceneIndex, setSceneIndex, shouldRunPoem, openGenPoem, advanceGeneratedChapter]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handleClick(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleClick]);

  const speaker = charById(node?.speaker ?? null);
  const isMC = node?.speaker === MC_SPEAKER;
  const speakerColor = isMC ? PLAYER_COLOR : (speaker?.color ?? '#c4a35a');
  // Someone is speaking ALOUD (cast member or the player) vs. narration/thought.
  const isSpeech = isMC || !!speaker;
  const chipName = isMC ? personalize('{mc}') : speaker?.name;

  if (!world || !chapter || !scene || !node) {
    return (
      <GeneratingState
        title="Composing your story…"
        note="Setting the stage for your opening scene."
        steps={['Opening the first page…', 'Bringing the cast into the room…', 'Setting the scene…']}
      />
    );
  }

  const filter = TIME_FILTERS[scene.timeOfDay] ?? '';

  return (
    <div className="relative w-full min-h-[100dvh] overflow-hidden cursor-pointer" onClick={handleClick}>
      {/* Top progress chip */}
      <div className="absolute top-3 right-3 z-30 pointer-events-none">
        <span className="px-2.5 py-1 rounded-full text-[11px]"
          style={{ backgroundColor: 'rgba(26,21,32,0.7)', border: '1px solid rgba(196,163,90,0.18)', color: '#c4a35a', backdropFilter: 'blur(4px)' }}>
          Ch.{chapterIndex + 1}/{world.routePlan.totalChapters}
        </span>
      </div>
      {/* Chapter-transition overlay */}
      <AnimatePresence>
        {(genLoading || waitingScene) && (
          <motion.div
            className="absolute inset-0 z-40"
            style={{ backgroundColor: 'rgba(19,16,26,0.88)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <GeneratingState
              fill={false}
              title={waitingScene ? 'Writing the next scene…' : 'Turning the page…'}
              note="Shaped by your choices — just a moment."
              steps={waitingScene ? [
                'Following the thread of the scene…',
                'Letting it breathe…',
                'Almost ready…',
              ] : [
                'Picking up where you left off…',
                'Letting the characters react to you…',
                'Setting the next scene…',
                'Finding the right words…',
              ]}
            />
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

      {/* Readability scrim — guarantees the dialogue box reads on ANY background */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 z-[15] pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(12,10,18,0.96) 0%, rgba(12,10,18,0.8) 30%, rgba(12,10,18,0.35) 60%, transparent 100%)' }} />

      {/* Dialogue box */}
      <div ref={boxRef} className="absolute bottom-0 left-0 right-0 z-20 p-4 md:p-6">
        <motion.div
          className="max-w-4xl mx-auto rounded-lg p-4 md:p-6"
          style={{
            backgroundColor: 'rgba(18, 14, 24, 0.95)',
            border: '1px solid rgba(196, 163, 90, 0.35)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
          }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={node.id}
        >
          {isSpeech && chipName && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-sm font-semibold mb-2"
              style={{
                backgroundColor: isMC ? 'rgba(20,28,40,0.9)' : 'rgba(12,10,18,0.85)',
                borderLeft: `3px solid ${speakerColor}`,
                border: `1px solid ${speakerColor}`,
                color: lighten(speakerColor),
                fontFamily: 'var(--font-playfair, serif)',
                textShadow: '0 1px 3px rgba(0,0,0,0.7)',
              }}
            >
              {isMC && <span className="text-[10px] uppercase tracking-wider opacity-70">you</span>}
              {chipName}
            </div>
          )}
          <div
            className={`text-base md:text-lg leading-relaxed min-h-[3em] ${isMC ? 'pl-3' : ''}`}
            style={{
              // Speech (cast or player) is upright sans-serif; narration / inner
              // thought is italic serif — so "talking" never looks like "thinking".
              fontFamily: isSpeech ? 'var(--font-nunito, sans-serif)' : 'var(--font-eb-garamond, serif)',
              color: isMC ? '#dfe9f5' : speaker ? '#f1ebdd' : '#c2b6a4',
              fontStyle: isSpeech ? 'normal' : 'italic',
              borderLeft: isMC ? `2px solid ${PLAYER_COLOR}66` : undefined,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            <Typewriter text={personalize(node.text)} speed={textSpeed} onDone={() => setTextComplete(true)} skipRef={skipRef} />
          </div>

          <AnimatePresence>
            {node.choices && textComplete && (
              <motion.div className="mt-4 space-y-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                {node.choices.map((choice, i) => (
                  <motion.button
                    key={i}
                    className="w-full text-left px-4 py-3 rounded transition-all text-sm md:text-base active:scale-[0.99]"
                    style={{ minHeight: 48, backgroundColor: 'rgba(42, 34, 53, 0.6)', border: '1px solid rgba(196, 163, 90, 0.15)', color: '#e8e0d0' }}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }}
                    whileHover={{ backgroundColor: 'rgba(196, 163, 90, 0.15)', borderColor: 'rgba(196, 163, 90, 0.4)', x: 5 }}
                    onClick={(e) => { e.stopPropagation(); genApplyChoice(choice); setTextComplete(false); }}
                  >
                    {choice.tone === 'flirt' && <span className="mr-2 text-pink-400">♥</span>}
                    <span className="mr-2" style={{ color: '#c4a35a' }}>▸</span>
                    {personalize(choice.text)}
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

        {/* Action HUD — touch-friendly, wraps on small screens */}
        <div className="max-w-4xl mx-auto mt-2 flex gap-2 justify-end items-center flex-wrap" onClick={(e) => e.stopPropagation()}>
          {([
            { k: 'menu' as const, icon: '☰', label: 'Menu' },
            { k: 'cast' as const, icon: '♥', label: 'Cast' },
            { k: 'settings' as const, icon: '⚙', label: 'Settings' },
          ]).map(({ k, icon, label }) => (
            <button
              key={k}
              onClick={() => setScreen(k)}
              aria-label={label}
              className="flex items-center gap-1.5 rounded transition-all active:scale-95"
              style={{ minHeight: 40, padding: '6px 12px', backgroundColor: 'rgba(26,21,32,0.72)', border: '1px solid rgba(196,163,90,0.15)', color: '#cbbfae', fontSize: 12, backdropFilter: 'blur(4px)' }}
            >
              <span style={{ color: '#c4a35a' }}>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <ShareSeed seed={world.seed} compact />
        </div>
      </div>
    </div>
  );
}
