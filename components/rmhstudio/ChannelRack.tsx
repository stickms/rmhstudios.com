/**
 * ChannelRack — Left sidebar listing all drum channels with mute/solo.
 */
'use client';

import { useStudioStore } from '@/lib/rmhstudio/store';

export default function ChannelRack() {
  const channels = useStudioStore(s => s.channels);
  const selectedChannel = useStudioStore(s => s.selectedChannel);
  const selectChannel = useStudioStore(s => s.selectChannel);
  const setChannelMute = useStudioStore(s => s.setChannelMute);
  const setChannelSolo = useStudioStore(s => s.setChannelSolo);

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
        </div>
      ))}
    </div>
  );
}
