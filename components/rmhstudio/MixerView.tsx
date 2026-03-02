/**
 * MixerView — Vertical channel strips with faders, pan knobs, mute/solo,
 * and VU meters. Master strip on the right.
 */
'use client';

import { useCallback } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';
import { AudioEngine } from '@/lib/rmhstudio/engine/AudioEngine';
import Fader from './Fader';
import Knob from './Knob';
import VuMeter from './VuMeter';

export default function MixerView() {
  const channels = useStudioStore(s => s.channels);
  const masterVolume = useStudioStore(s => s.masterVolume);
  const setChannelVolume = useStudioStore(s => s.setChannelVolume);
  const setChannelPan = useStudioStore(s => s.setChannelPan);
  const setChannelMute = useStudioStore(s => s.setChannelMute);
  const setChannelSolo = useStudioStore(s => s.setChannelSolo);
  const setMasterVolume = useStudioStore(s => s.setMasterVolume);

  const getChannelPeak = useCallback((index: number) => {
    return () => AudioEngine.getInstance().getMixer()?.getChannelPeak(index) ?? 0;
  }, []);

  const getMasterPeak = useCallback(() => {
    return AudioEngine.getInstance().getMixer()?.getMasterPeak() ?? 0;
  }, []);

  return (
    <div className="rstudio-mixer">
      {channels.map((ch, i) => (
        <div key={ch.id} className="rstudio-mixer-strip">
          {/* Channel color */}
          <div
            style={{
              width: 24,
              height: 4,
              borderRadius: 2,
              background: ch.color,
            }}
          />

          {/* VU Meter + Fader row */}
          <div className="flex gap-1 items-end">
            <VuMeter getPeak={getChannelPeak(i)} height={140} width={6} />
            <Fader
              value={ch.volume}
              onChange={v => setChannelVolume(i, v)}
              color={ch.color}
            />
          </div>

          {/* Pan */}
          <Knob
            value={ch.pan}
            min={-1}
            max={1}
            step={0.01}
            size={28}
            label="PAN"
            onChange={v => setChannelPan(i, v)}
          />

          {/* Mute / Solo */}
          <div className="flex gap-1">
            <button
              className={`rstudio-channel-btn ${ch.mute ? 'muted' : ''}`}
              onClick={() => setChannelMute(i, !ch.mute)}
              style={{ fontSize: 10, width: 24, height: 20 }}
            >
              M
            </button>
            <button
              className={`rstudio-channel-btn ${ch.solo ? 'soloed' : ''}`}
              onClick={() => setChannelSolo(i, !ch.solo)}
              style={{ fontSize: 10, width: 24, height: 20 }}
            >
              S
            </button>
          </div>

          {/* Label */}
          <div className="rstudio-mixer-label">{ch.name}</div>

          {/* dB readout */}
          <div style={{ fontSize: 9, color: 'var(--rstudio-text-dim)', fontFamily: 'var(--rstudio-font-mono)' }}>
            {volumeToDb(ch.volume)}
          </div>
        </div>
      ))}

      {/* ── Master Strip ── */}
      <div className="rstudio-mixer-strip master">
        <div
          style={{
            width: 32,
            height: 4,
            borderRadius: 2,
            background: 'var(--rstudio-accent)',
          }}
        />

        <div className="flex gap-1 items-end">
          <VuMeter getPeak={getMasterPeak} height={140} width={8} />
          <Fader
            value={masterVolume}
            onChange={setMasterVolume}
            color="var(--rstudio-accent)"
          />
        </div>

        <Knob
          value={0}
          min={-1}
          max={1}
          size={28}
          label="PAN"
          onChange={() => {}}
        />

        <div className="rstudio-mixer-label" style={{ fontWeight: 600, color: 'var(--rstudio-accent)' }}>
          Master
        </div>

        <div style={{ fontSize: 9, color: 'var(--rstudio-text-dim)', fontFamily: 'var(--rstudio-font-mono)' }}>
          {volumeToDb(masterVolume)}
        </div>
      </div>
    </div>
  );
}

function volumeToDb(v: number): string {
  if (v <= 0) return '-∞ dB';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}
