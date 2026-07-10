'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { deleteSave } from '@/lib/versecraft/persistence';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 md:p-5" style={{ backgroundColor: 'rgba(26,21,32,0.6)', border: '1px solid rgba(196,163,90,0.15)' }}>
      <h3 className="text-xs uppercase tracking-[0.25em] mb-3" style={{ color: '#c4a35a' }}>{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm" style={{ color: '#e8e0d0' }}>{label}</div>
        {hint && <div className="text-xs" style={{ color: '#7a7163' }}>{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="relative rounded-full transition-colors" aria-pressed={on}
      style={{ width: 48, height: 28, backgroundColor: on ? 'rgba(196,163,90,0.5)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(196,163,90,0.3)' }}>
      <motion.span className="absolute top-0.5 rounded-full" style={{ width: 22, height: 22, backgroundColor: on ? '#e8e0d0' : '#8a8076' }}
        animate={{ left: on ? 24 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(196,163,90,0.2)' }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} className="px-3 py-1.5 text-xs transition-colors"
          style={{ backgroundColor: value === o.v ? 'rgba(196,163,90,0.25)' : 'transparent', color: value === o.v ? '#fff' : '#a89888' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GameSettings() {
  const settings = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);
  const goBack = useGameStore(s => s.goBack);
  const [cleared, setCleared] = useState(false);

  return (
    <div className="min-h-[100dvh] overflow-y-auto px-4 py-6 md:py-10" style={{ background: 'radial-gradient(ellipse at top, #221b2c, #13101a 75%)' }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={goBack} className="text-sm px-3 py-2 rounded -ml-1" style={{ color: '#a89888' }}>← Back</button>
          <h1 className="text-2xl" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}>Settings</h1>
        </div>

        <div className="space-y-4">
          <Section title="Player">
            <Row label="Name" hint="What the cast calls you in new stories.">
              <input
                value={settings.playerName === 'Ash' ? '' : settings.playerName}
                onChange={e => updateSettings({ playerName: e.target.value || 'You' })}
                placeholder="You"
                className="w-36 px-3 py-2 rounded text-base text-right"
                style={{ backgroundColor: 'rgba(42,34,53,0.6)', border: '1px solid rgba(196,163,90,0.2)', color: '#e8e0d0' }}
              />
            </Row>
            <Row label="Pronouns">
              <Segmented value={settings.playerPronouns}
                options={[{ v: 'she/her', label: 'she' }, { v: 'he/him', label: 'he' }, { v: 'they/them', label: 'they' }] as const}
                onChange={v => updateSettings({ playerPronouns: v })} />
            </Row>
          </Section>

          <Section title="Story">
            <Row label="Mature & dark themes" hint="Default for new stories (grief, mental health, desire).">
              <Toggle on={settings.matureDefault} onChange={v => updateSettings({ matureDefault: v })} />
            </Row>
            <Row label="Text speed">
              <Segmented value={settings.textSpeed}
                options={[{ v: 'slow', label: 'Slow' }, { v: 'normal', label: 'Normal' }, { v: 'fast', label: 'Fast' }, { v: 'instant', label: 'Instant' }] as const}
                onChange={v => updateSettings({ textSpeed: v })} />
            </Row>
          </Section>

          <Section title="Display">
            <Row label="Reduced motion" hint="Calms background animation and transitions.">
              <Toggle on={settings.reducedMotion} onChange={v => updateSettings({ reducedMotion: v })} />
            </Row>
          </Section>

          <Section title="Audio">
            <Row label="Music">
              <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
                onChange={e => updateSettings({ musicVolume: Number(e.target.value) })} className="w-36 accent-amber-500" />
            </Row>
            <Row label="Sound effects">
              <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume}
                onChange={e => updateSettings({ sfxVolume: Number(e.target.value) })} className="w-36 accent-amber-500" />
            </Row>
          </Section>

          <Section title="Data">
            <Row label="Local save" hint="Clears the auto-save on this device.">
              <button
                onClick={() => { deleteSave(0); setCleared(true); setTimeout(() => setCleared(false), 1800); }}
                className="px-3 py-2 rounded text-xs"
                style={{ backgroundColor: 'rgba(180,60,70,0.15)', border: '1px solid rgba(180,60,70,0.4)', color: '#e8a0a8' }}>
                {cleared ? 'Cleared ✓' : 'Clear'}
              </button>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
