'use client';

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { GeneratingState } from './GeneratingState';

const EXAMPLE_PROMPTS = [
  'a burnt-out comp-sci senior who secretly writes poetry at 3am',
  'a transfer student starting over after losing someone',
  'a theatre kid who feels most real on stage',
  'a quiet art major learning to be seen',
];

export function WorldSetup() {
  const startGeneratedGame = useGameStore(s => s.startGeneratedGame);
  const setScreen = useGameStore(s => s.setScreen);
  const settings = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);

  const [name, setName] = useState(settings.playerName === 'Ash' ? '' : settings.playerName);
  const [pronouns, setPronouns] = useState<typeof settings.playerPronouns>(settings.playerPronouns);
  const [customOn, setCustomOn] = useState(Boolean(settings.customPronouns));
  const [customPronouns, setCustomPronouns] = useState(settings.customPronouns ?? '');
  const [attraction, setAttraction] = useState<typeof settings.attraction>(settings.attraction ?? 'everyone');
  const [prompt, setPrompt] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [intense, setIntense] = useState(settings.matureDefault);

  const begin = async (opts: { random?: boolean; seed?: string }) => {
    if (submitting) return;
    const playerName = name.trim() || 'You';
    const trimmedCustom = customOn ? customPronouns.trim() : '';
    updateSettings({
      playerName,
      playerPronouns: pronouns,
      customPronouns: trimmedCustom,
      attraction,
    });
    setSubmitting(true);
    try {
      const base = opts.random ? '' : prompt.trim();
      // Tone hint is baked into the prompt so it's part of the shareable seed.
      const toned = opts.seed
        ? undefined // shared seeds keep their original tone
        : (intense ? base : `${base} [Tone: keep it lighter and ultimately hopeful; avoid graphic darkness.]`.trim());
      await startGeneratedGame({
        seed: opts.seed,
        prompt: toned,
        playerName,
      });
    } catch {
      setSubmitting(false);
    }
  };

  // text-base (16px) avoids iOS focus-zoom; comfortable tap height.
  const field = 'w-full px-3 py-2.5 rounded text-base';
  const fieldStyle = {
    backgroundColor: 'rgba(42, 34, 53, 0.6)',
    border: '1px solid rgba(196, 163, 90, 0.2)',
    color: '#e8e0d0',
  } as const;
  const label = { color: '#c4a35a', fontFamily: 'var(--font-playfair, serif)' } as const;

  if (submitting) {
    return (
      <GeneratingState
        title="Composing your world…"
        note="The story is being written just for you — this can take a few seconds."
        steps={[
          'Summoning a cast of characters…',
          'Giving each of them a secret, a fear, a dream…',
          'Imagining the setting and its mood…',
          'Casting their faces and looks…',
          'Plotting the emotional arc of your route…',
          'Writing the opening scene…',
          'Almost there…',
        ]}
      />
    );
  }

  return (
    <div className="relative flex flex-col items-center min-h-[100dvh] overflow-y-auto py-12 px-4">
      <motion.div
        className="relative z-10 w-full max-w-lg"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>
          Begin a Verse
        </h1>
        <p className="text-sm italic text-center mb-8" style={{ color: '#a89888' }}>
          Every seed is a different world, cast, and story. Yours alone — and shareable.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm mb-1.5" style={label}>Your name</label>
            <input className={field} style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="What should they call you?" />
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={label}>Your pronouns</label>
            <div className="flex gap-2 flex-wrap">
              {(['she/her', 'he/him', 'they/them'] as const).map(p => {
                const active = !customOn && pronouns === p;
                return (
                  <button
                    key={p}
                    onClick={() => { setCustomOn(false); setPronouns(p); }}
                    className="flex-1 px-3 py-2 rounded text-sm transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(196, 163, 90, 0.2)' : 'rgba(42, 34, 53, 0.6)',
                      border: `1px solid ${active ? 'rgba(196, 163, 90, 0.5)' : 'rgba(196, 163, 90, 0.15)'}`,
                      color: '#e8e0d0',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setCustomOn(true)}
                className="px-3 py-2 rounded text-sm transition-all"
                style={{
                  backgroundColor: customOn ? 'rgba(196, 163, 90, 0.2)' : 'rgba(42, 34, 53, 0.6)',
                  border: `1px solid ${customOn ? 'rgba(196, 163, 90, 0.5)' : 'rgba(196, 163, 90, 0.15)'}`,
                  color: '#e8e0d0',
                }}
              >
                custom
              </button>
            </div>
            {customOn && (
              <input
                className={`${field} mt-2`} style={fieldStyle}
                value={customPronouns} onChange={e => setCustomPronouns(e.target.value)}
                placeholder="e.g. ze/zir/zirs"
              />
            )}
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={label}>Drawn to</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { v: 'women' as const, l: 'Women' },
                { v: 'men' as const, l: 'Men' },
                { v: 'everyone' as const, l: 'Everyone' },
                { v: 'none' as const, l: 'No romance' },
              ]).map(({ v, l }) => {
                const active = attraction === v;
                return (
                  <button
                    key={v}
                    onClick={() => setAttraction(v)}
                    className="flex-1 px-3 py-2 rounded text-sm transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'rgba(196, 163, 90, 0.2)' : 'rgba(42, 34, 53, 0.6)',
                      border: `1px solid ${active ? 'rgba(196, 163, 90, 0.5)' : 'rgba(196, 163, 90, 0.15)'}`,
                      color: '#e8e0d0',
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: '#777' }}>
              Shapes who the story lets you fall for — or keeps it all platonic.
            </p>
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={label}>
              Describe the experience you want <span style={{ color: '#666' }}>(optional)</span>
            </label>
            <textarea
              className={field} style={{ ...fieldStyle, minHeight: '90px', resize: 'vertical' }}
              value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. a burnt-out college student who finds a found-family in a poetry club…"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_PROMPTS.map(ex => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-xs px-2 py-1 rounded transition-all hover:brightness-125"
                  style={{ backgroundColor: 'rgba(42, 34, 53, 0.5)', border: '1px solid rgba(196, 163, 90, 0.12)', color: '#a89888' }}
                >
                  {ex.length > 38 ? ex.slice(0, 36) + '…' : ex}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setIntense(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all"
            style={{ backgroundColor: 'rgba(42, 34, 53, 0.5)', border: '1px solid rgba(196, 163, 90, 0.15)' }}
          >
            <span
              className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs"
              style={{ backgroundColor: intense ? 'rgba(196,163,90,0.3)' : 'transparent', border: '1px solid rgba(196,163,90,0.5)', color: '#e8e0d0' }}
            >
              {intense ? '✓' : ''}
            </span>
            <span className="text-sm" style={{ color: '#e8e0d0' }}>
              Allow mature &amp; dark themes
              <span className="block text-xs" style={{ color: '#888' }}>grief, mental health, loss, desire — handled with care. For adult players.</span>
            </span>
          </button>

          <div className="flex gap-3 pt-1">
            <motion.button
              className="flex-1 px-6 py-3 rounded text-base tracking-wide"
              style={{ backgroundColor: 'rgba(196, 163, 90, 0.22)', border: '1px solid rgba(196, 163, 90, 0.5)', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => begin({})}
            >
              ▸ Begin
            </motion.button>
            <motion.button
              className="px-5 py-3 rounded text-base"
              style={{ backgroundColor: 'rgba(42, 34, 53, 0.6)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => begin({ random: true })}
            >
              🎲 Surprise me
            </motion.button>
          </div>

          {/* Shared version */}
          <div className="pt-4 mt-2" style={{ borderTop: '1px solid rgba(196, 163, 90, 0.12)' }}>
            <label className="block text-sm mb-1.5" style={label}>Play a shared version</label>
            <div className="flex gap-2">
              <input
                className={field} style={fieldStyle} value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                placeholder="enter a seed code, e.g. ember-tide-hush-417"
              />
              <button
                className="px-4 py-2 rounded text-sm whitespace-nowrap"
                style={{ backgroundColor: 'rgba(42, 34, 53, 0.6)', border: '1px solid rgba(196, 163, 90, 0.2)', color: seedInput.trim() ? '#e8e0d0' : '#666' }}
                disabled={!seedInput.trim()}
                onClick={() => begin({ seed: seedInput })}
              >
                Load
              </button>
            </div>
          </div>

          <button
            className="w-full text-center text-xs mt-2 transition-all hover:brightness-125"
            style={{ color: '#777' }}
            onClick={() => setScreen('menu')}
          >
            ← Back to menu
          </button>
        </div>
      </motion.div>
    </div>
  );
}
