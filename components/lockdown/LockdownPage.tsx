import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Brain as BrainIcon, CornerDownLeft } from 'lucide-react';
import './lockdown.css';

const BrainExplorer = lazy(() =>
  import('./BrainExplorer').then((m) => ({ default: m.BrainExplorer }))
);

type BrainRegion = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  link: string;
};

const brainRegions: BrainRegion[] = [
  {
    id: 'prefrontal',
    name: 'Prefrontal Cortex',
    shortName: 'PFC',
    summary: 'Executive intent, planning, restraint, and context switching.',
    link: 'RMHlink would prioritize high-bandwidth intent decoding here, turning deliberate goals into interface commands for software, robotics, and simulated worlds.',
  },
  {
    id: 'motor',
    name: 'Motor Cortex',
    shortName: 'Motor',
    summary: 'Voluntary movement plans before they become muscle action.',
    link: 'RMHlink would map imagined movement into precise controls, enabling full-body VR agency, prosthetic output, and low-latency digital embodiment.',
  },
  {
    id: 'somatosensory',
    name: 'Somatosensory Cortex',
    shortName: 'Touch',
    summary: 'Touch, pressure, body position, and surface perception.',
    link: 'RMHlink would close the loop with synthetic touch, making AR objects and VR environments feel physically present rather than merely visible.',
  },
  {
    id: 'visual',
    name: 'Visual Cortex',
    shortName: 'Vision',
    summary: 'Image formation, motion, edges, depth, and visual prediction.',
    link: 'RMHlink would align neural visual processing with rendered scenes for realistic VR/AR overlays, perceptual stabilization, and simulation fidelity.',
  },
  {
    id: 'temporal',
    name: 'Temporal Lobe',
    shortName: 'Memory',
    summary: 'Language, auditory meaning, memory association, and recognition.',
    link: 'RMHlink would use this region to anchor persistent virtual identities, spatial memories, voice interfaces, and context-aware recall.',
  },
  {
    id: 'hippocampus',
    name: 'Hippocampal System',
    shortName: 'Map',
    summary: 'Spatial maps, episode formation, and memory indexing.',
    link: 'RMHlink would coordinate simulated places with memory maps so VR spaces feel learnable, navigable, and continuous across sessions.',
  },
  {
    id: 'thalamus',
    name: 'Thalamic Relay',
    shortName: 'Relay',
    summary: 'Routing hub for sensory streams and attention-gated signals.',
    link: 'RMHlink would treat this as a timing and routing target, synchronizing multisensory input before it reaches conscious simulation.',
  },
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    shortName: 'Timing',
    summary: 'Prediction, timing, balance, correction, and fluent control.',
    link: 'RMHlink would use cerebellar prediction to make avatars, robotics, and AR interaction feel smooth, immediate, and physically believable.',
  },
  {
    id: 'marlon',
    name: 'Marlon Jack',
    shortName: 'Marlon',
    summary: 'Lead scientist and developer of RMHlink.',
    link: 'Marlon Jack leads the scientific and engineering direction for RMHlink, bringing the BCI interface, simulation stack, and full-brain interaction roadmap into one system.',
  },
];

export function LockdownPage() {
  const [selectedRegion, setSelectedRegion] = useState(brainRegions[0]);
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submittedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (submittedTimer.current !== null) window.clearTimeout(submittedTimer.current);
    };
  }, []);

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPassword('');
    setSubmitted(true);
    if (submittedTimer.current !== null) window.clearTimeout(submittedTimer.current);
    submittedTimer.current = window.setTimeout(() => setSubmitted(false), 1800);
  };

  return (
    <main className="lockdown-page">
      <div className="lockdown-bg" aria-hidden="true">
        <span className="lockdown-form lockdown-form-a" />
        <span className="lockdown-form lockdown-form-b" />
        <span className="lockdown-form lockdown-form-c" />
        <span className="lockdown-grid" />
      </div>

      <section className="lockdown-stage" aria-labelledby="lockdown-title">
        <div className="lockdown-brand">
          <img src="/favicon.svg" alt="" aria-hidden="true" />
          <span>RMHStudios</span>
        </div>

        <h1 id="lockdown-title" className="lockdown-title">COMING SOON</h1>

        <div className="brain-console" aria-label="Interactive RMHlink brain region explorer">
          <div className="brain-viewport">
            <Suspense fallback={<div className="brain-animation-shell" />}>
              <BrainExplorer
                selectedRegion={selectedRegion}
                onSelect={(r) => {
                  const full = brainRegions.find((b) => b.id === r.id);
                  if (full) setSelectedRegion(full);
                }}
              />
            </Suspense>
          </div>

          <aside className="region-panel" aria-live="polite">
            <div className="region-panel__eyebrow">
              <BrainIcon size={16} aria-hidden="true" />
              <span>RMHlink target</span>
            </div>
            <h2>{selectedRegion.name}</h2>
            <p className="region-panel__summary">{selectedRegion.summary}</p>
            <p>{selectedRegion.link}</p>
          </aside>
        </div>

        <div className="region-selector" aria-label="Brain regions">
          {brainRegions.map((region) => (
            <button
              key={region.id}
              type="button"
              className={region.id === selectedRegion.id ? 'is-active' : ''}
              onClick={() => setSelectedRegion(region)}
            >
              {region.shortName}
            </button>
          ))}
        </div>
      </section>

      <form className="password-dock" onSubmit={submitPassword}>
        <div className="password-row" data-submitted={submitted}>
          <input
            id="lockdown-password"
            type="text"
            name="rmh-access-entry"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={submitted ? 'Coming soon' : 'Password'}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            aria-label="Access password"
          />
          <button type="submit" aria-label="Enter password">
            <CornerDownLeft size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </main>
  );
}
