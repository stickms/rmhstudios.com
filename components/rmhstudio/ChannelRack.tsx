/**
 * ChannelRack — Left sidebar listing all channels with mute/solo,
 * instrument badges, and an Add Channel button.
 */
'use client';

import { useState } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';
import type { InstrumentType } from '@/lib/rmhstudio/types';

const INSTRUMENT_BADGE: Record<InstrumentType, string> = {
  drum: 'DR',
  wavelab: 'WL',
  drift: 'DF',
};

export default function ChannelRack() {
  const channels = useStudioStore(s => s.channels);
  const selectedChannel = useStudioStore(s => s.selectedChannel);
  const selectChannel = useStudioStore(s => s.selectChannel);
  const setChannelMute = useStudioStore(s => s.setChannelMute);
  const setChannelSolo = useStudioStore(s => s.setChannelSolo);
  const addChannel = useStudioStore(s => s.addChannel);
  const removeChannel = useStudioStore(s => s.removeChannel);

  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleAdd = (instrument: InstrumentType) => {
    addChannel(instrument);
    setShowAddMenu(false);
  };

  return (
    <div className="rstudio-channel-rack">
      {channels.map((ch, i) => (
        <div
          key={ch.id}
          className={`rstudio-channel-item ${selectedChannel === i ? 'selected' : ''}`}
          onClick={() => selectChannel(i)}
        >
          <div
            className="rstudio-channel-color"
            style={{ backgroundColor: ch.color }}
          />
          <span
            className="rstudio-instrument-badge"
            data-instrument={ch.instrument}
            title={ch.instrument}
          >
            {INSTRUMENT_BADGE[ch.instrument]}
          </span>
          <span className="rstudio-channel-name">{ch.name}</span>
          <button
            className={`rstudio-channel-btn ${ch.mute ? 'muted' : ''}`}
            onClick={(e) => { e.stopPropagation(); setChannelMute(i, !ch.mute); }}
            title={ch.mute ? 'Unmute' : 'Mute'}
          >
            M
          </button>
          <button
            className={`rstudio-channel-btn ${ch.solo ? 'soloed' : ''}`}
            onClick={(e) => { e.stopPropagation(); setChannelSolo(i, !ch.solo); }}
            title={ch.solo ? 'Unsolo' : 'Solo'}
          >
            S
          </button>
          {channels.length > 1 && (
            <button
              className="rstudio-channel-btn rstudio-channel-remove"
              onClick={(e) => { e.stopPropagation(); removeChannel(i); }}
              title="Remove channel"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Add Channel */}
      <div className="rstudio-add-channel">
        {showAddMenu ? (
          <div className="rstudio-add-menu">
            <button className="rstudio-add-menu-item" onClick={() => handleAdd('drum')}>
              <span className="rstudio-instrument-badge" data-instrument="drum">DR</span> Drum
            </button>
            <button className="rstudio-add-menu-item" onClick={() => handleAdd('wavelab')}>
              <span className="rstudio-instrument-badge" data-instrument="wavelab">WL</span> WaveLab
            </button>
            <button className="rstudio-add-menu-item" onClick={() => handleAdd('drift')}>
              <span className="rstudio-instrument-badge" data-instrument="drift">DF</span> Drift
            </button>
            <button
              className="rstudio-add-menu-cancel"
              onClick={() => setShowAddMenu(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="rstudio-add-channel-btn"
            onClick={() => setShowAddMenu(true)}
          >
            + Add Channel
          </button>
        )}
      </div>
    </div>
  );
}
