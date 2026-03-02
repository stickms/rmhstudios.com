/**
 * SynthPanel — Knob-based parameter editor for WaveLab and Drift synths.
 *
 * Shown below the sequencer/mixer when a melodic channel is selected.
 */
'use client';

import { useStudioStore } from '@/lib/rmhstudio/store';
import type {
  WaveLabParams,
  DriftParams,
  OscWaveform,
  ADSREnvelope,
} from '@/lib/rmhstudio/types';
import Knob from './Knob';

// ─── Note helpers ────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiNoteName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

// ─── Shared sub-components ───────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rstudio-synth-section">
      <div className="rstudio-synth-section-title">{title}</div>
      <div className="rstudio-synth-section-body">{children}</div>
    </div>
  );
}

const WAVEFORMS: OscWaveform[] = ['sine', 'sawtooth', 'square', 'triangle'];
const WAVEFORM_LABELS: Record<OscWaveform, string> = {
  sine: 'SIN', sawtooth: 'SAW', square: 'SQR', triangle: 'TRI',
};

function WaveformPicker({
  value,
  onChange,
}: {
  value: OscWaveform;
  onChange: (w: OscWaveform) => void;
}) {
  return (
    <div className="rstudio-waveform-picker">
      {WAVEFORMS.map(w => (
        <button
          key={w}
          className={`rstudio-waveform-btn ${w === value ? 'active' : ''}`}
          onClick={() => onChange(w)}
        >
          {WAVEFORM_LABELS[w]}
        </button>
      ))}
    </div>
  );
}

function EnvelopeGroup({
  label,
  env,
  onChange,
}: {
  label: string;
  env: ADSREnvelope;
  onChange: (e: Partial<ADSREnvelope>) => void;
}) {
  return (
    <Section title={label}>
      <Knob label="ATK" value={env.attack} min={0.001} max={2} step={0.001} size={32} onChange={v => onChange({ attack: v })} />
      <Knob label="DEC" value={env.decay} min={0.001} max={2} step={0.001} size={32} onChange={v => onChange({ decay: v })} />
      <Knob label="SUS" value={env.sustain} min={0} max={1} step={0.01} size={32} onChange={v => onChange({ sustain: v })} />
      <Knob label="REL" value={env.release} min={0.001} max={4} step={0.001} size={32} onChange={v => onChange({ release: v })} />
    </Section>
  );
}

// ─── WaveLab Panel ───────────────────────────────────────────────

function WaveLabPanel({
  params,
  note,
  onParams,
  onNote,
}: {
  params: WaveLabParams;
  note: number;
  onParams: (p: Partial<WaveLabParams>) => void;
  onNote: (n: number) => void;
}) {
  return (
    <>
      {/* Note */}
      <Section title="Note">
        <div className="rstudio-note-control">
          <button className="rstudio-note-btn" onClick={() => onNote(Math.max(0, note - 1))}>-</button>
          <span className="rstudio-note-display">{midiNoteName(note)}</span>
          <button className="rstudio-note-btn" onClick={() => onNote(Math.min(127, note + 1))}>+</button>
        </div>
      </Section>

      {/* Osc 1 */}
      <Section title="OSC 1">
        <WaveformPicker value={params.osc1.waveform} onChange={w => onParams({ osc1: { ...params.osc1, waveform: w } })} />
        <Knob label="COARSE" value={params.osc1.coarse} min={-24} max={24} step={1} size={32} onChange={v => onParams({ osc1: { ...params.osc1, coarse: v } })} />
        <Knob label="FINE" value={params.osc1.fine} min={-100} max={100} step={1} size={32} onChange={v => onParams({ osc1: { ...params.osc1, fine: v } })} />
        <Knob label="LEVEL" value={params.osc1.level} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ osc1: { ...params.osc1, level: v } })} />
      </Section>

      {/* Osc 2 */}
      <Section title="OSC 2">
        <WaveformPicker value={params.osc2.waveform} onChange={w => onParams({ osc2: { ...params.osc2, waveform: w } })} />
        <Knob label="COARSE" value={params.osc2.coarse} min={-24} max={24} step={1} size={32} onChange={v => onParams({ osc2: { ...params.osc2, coarse: v } })} />
        <Knob label="FINE" value={params.osc2.fine} min={-100} max={100} step={1} size={32} onChange={v => onParams({ osc2: { ...params.osc2, fine: v } })} />
        <Knob label="LEVEL" value={params.osc2.level} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ osc2: { ...params.osc2, level: v } })} />
      </Section>

      {/* Filter */}
      <Section title="Filter">
        <div className="rstudio-waveform-picker">
          {(['lowpass', 'highpass', 'bandpass'] as const).map(t => (
            <button key={t} className={`rstudio-waveform-btn ${params.filter.type === t ? 'active' : ''}`} onClick={() => onParams({ filter: { ...params.filter, type: t } })}>
              {t === 'lowpass' ? 'LP' : t === 'highpass' ? 'HP' : 'BP'}
            </button>
          ))}
        </div>
        <Knob label="CUTOFF" value={params.filter.cutoff} min={20} max={20000} step={1} size={32} onChange={v => onParams({ filter: { ...params.filter, cutoff: v } })} />
        <Knob label="RES" value={params.filter.resonance} min={0} max={30} step={0.1} size={32} onChange={v => onParams({ filter: { ...params.filter, resonance: v } })} />
        <Knob label="ENV" value={params.filter.envAmount} min={-1} max={1} step={0.01} size={32} onChange={v => onParams({ filter: { ...params.filter, envAmount: v } })} />
      </Section>

      {/* Amp Envelope */}
      <EnvelopeGroup
        label="Amp Env"
        env={params.ampEnv}
        onChange={partial => onParams({ ampEnv: { ...params.ampEnv, ...partial } })}
      />

      {/* Filter Envelope */}
      <EnvelopeGroup
        label="Filter Env"
        env={params.filterEnv}
        onChange={partial => onParams({ filterEnv: { ...params.filterEnv, ...partial } })}
      />
    </>
  );
}

// ─── Drift Panel ─────────────────────────────────────────────────

function DriftPanel({
  params,
  note,
  onParams,
  onNote,
}: {
  params: DriftParams;
  note: number;
  onParams: (p: Partial<DriftParams>) => void;
  onNote: (n: number) => void;
}) {
  return (
    <>
      {/* Note */}
      <Section title="Note">
        <div className="rstudio-note-control">
          <button className="rstudio-note-btn" onClick={() => onNote(Math.max(0, note - 1))}>-</button>
          <span className="rstudio-note-display">{midiNoteName(note)}</span>
          <button className="rstudio-note-btn" onClick={() => onNote(Math.min(127, note + 1))}>+</button>
        </div>
      </Section>

      {/* Osc 1 */}
      <Section title="OSC 1">
        <WaveformPicker value={params.osc1.waveform} onChange={w => onParams({ osc1: { ...params.osc1, waveform: w } })} />
        <Knob label="LEVEL" value={params.osc1.level} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ osc1: { ...params.osc1, level: v } })} />
      </Section>

      {/* Osc 2 */}
      <Section title="OSC 2">
        <WaveformPicker value={params.osc2.waveform} onChange={w => onParams({ osc2: { ...params.osc2, waveform: w } })} />
        <Knob label="LEVEL" value={params.osc2.level} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ osc2: { ...params.osc2, level: v } })} />
      </Section>

      {/* Sub */}
      <Section title="Sub Osc">
        <button
          className={`rstudio-waveform-btn ${params.sub.enabled ? 'active' : ''}`}
          onClick={() => onParams({ sub: { ...params.sub, enabled: !params.sub.enabled } })}
        >
          {params.sub.enabled ? 'ON' : 'OFF'}
        </button>
        <button
          className={`rstudio-waveform-btn ${params.sub.octave === -1 ? 'active' : ''}`}
          onClick={() => onParams({ sub: { ...params.sub, octave: -1 } })}
        >
          -1
        </button>
        <button
          className={`rstudio-waveform-btn ${params.sub.octave === -2 ? 'active' : ''}`}
          onClick={() => onParams({ sub: { ...params.sub, octave: -2 } })}
        >
          -2
        </button>
      </Section>

      {/* Filter */}
      <Section title="Filter">
        <Knob label="CUTOFF" value={params.filter.cutoff} min={20} max={20000} step={1} size={32} onChange={v => onParams({ filter: { ...params.filter, cutoff: v } })} />
        <Knob label="RES" value={params.filter.resonance} min={0} max={30} step={0.1} size={32} onChange={v => onParams({ filter: { ...params.filter, resonance: v } })} />
        <Knob label="ENV" value={params.filter.envAmount} min={-1} max={1} step={0.01} size={32} onChange={v => onParams({ filter: { ...params.filter, envAmount: v } })} />
        <Knob label="DRIVE" value={params.filter.drive} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ filter: { ...params.filter, drive: v } })} />
      </Section>

      {/* Amp Envelope */}
      <EnvelopeGroup
        label="Amp Env"
        env={params.ampEnv}
        onChange={partial => onParams({ ampEnv: { ...params.ampEnv, ...partial } })}
      />

      {/* Filter Envelope */}
      <EnvelopeGroup
        label="Filter Env"
        env={params.filterEnv}
        onChange={partial => onParams({ filterEnv: { ...params.filterEnv, ...partial } })}
      />

      {/* Mono Controls */}
      <Section title="Mono">
        <Knob label="GLIDE" value={params.glide} min={0} max={0.5} step={0.001} size={32} onChange={v => onParams({ glide: v })} />
        <Knob label="ACCENT" value={params.accent} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ accent: v })} />
        <Knob label="DRIFT" value={params.drift} min={0} max={1} step={0.01} size={32} onChange={v => onParams({ drift: v })} />
      </Section>
    </>
  );
}

// ─── Main SynthPanel ─────────────────────────────────────────────

export default function SynthPanel() {
  const selectedChannel = useStudioStore(s => s.selectedChannel);
  const channels = useStudioStore(s => s.channels);
  const updateSynthParams = useStudioStore(s => s.updateSynthParams);
  const setChannelNote = useStudioStore(s => s.setChannelNote);

  const channel = channels[selectedChannel];
  if (!channel || channel.instrument === 'drum') return null;

  const { instrument, note, synthParams } = channel;
  if (!synthParams) return null;

  return (
    <div className="rstudio-synth-panel">
      <div className="rstudio-synth-header">
        <span className="rstudio-synth-badge" data-instrument={instrument}>
          {instrument === 'wavelab' ? 'WaveLab' : 'Drift'}
        </span>
        <span className="rstudio-synth-channel-name">{channel.name}</span>
      </div>
      <div className="rstudio-synth-body">
        {instrument === 'wavelab' && (
          <WaveLabPanel
            params={synthParams as WaveLabParams}
            note={note}
            onParams={p => updateSynthParams(selectedChannel, p)}
            onNote={n => setChannelNote(selectedChannel, n)}
          />
        )}
        {instrument === 'drift' && (
          <DriftPanel
            params={synthParams as DriftParams}
            note={note}
            onParams={p => updateSynthParams(selectedChannel, p)}
            onNote={n => setChannelNote(selectedChannel, n)}
          />
        )}
      </div>
    </div>
  );
}
