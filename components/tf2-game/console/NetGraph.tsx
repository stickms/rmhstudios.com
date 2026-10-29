/**
 * `net_graph` and `cl_showpos`, drawn over the game like Source's
 * CNetGraphPanel: 1 — fps, ping, incoming and outgoing traffic; 2 — plus loss,
 * choke and the update rate; 3 — plus the frame's phases, draw calls and
 * entities; 4 — plus a frame-time graph. The numbers come from the console
 * (the client's stats and its network counters, sampled four times a second —
 * a timer, not a frame loop: the game owns the only frame loop).
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientStats } from '@/lib/tf2-game/client/game-client';
import type { GameConsole } from '@/lib/tf2-game/console/game-console';
import type { NetGraphStats } from '@/lib/tf2-game/console/net-graph';

const SAMPLE_MS = 250;
/** Frame-time bars kept for net_graph 4. */
const GRAPH_SAMPLES = 48;

interface Snapshot {
  level: number;
  showPos: boolean;
  stats: ClientStats | null;
  net: NetGraphStats | null;
  pos: ReturnType<GameConsole['position']>;
  frames: number[];
}

const kb = (bytesPerSec: number) => (bytesPerSec / 1024).toFixed(2);

export default function NetGraph({ con }: { con: GameConsole }) {
  const { t } = useTranslation('c-tf2-game');
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const frames: number[] = [];
    const id = window.setInterval(() => {
      const level = con.netGraph.int;
      const showPos = con.showPos.int > 0;
      // Sample the counters always (so the rates are ready the moment net_graph turns on).
      const net = con.sampleNet(performance.now());
      if (!level && !showPos) {
        setSnap((s) => (s ? null : s));
        return;
      }
      const stats = con.stats();
      if (stats) {
        frames.push(stats.frameMs);
        if (frames.length > GRAPH_SAMPLES) frames.shift();
      }
      setSnap({ level, showPos, stats, net, pos: showPos ? con.position() : null, frames: frames.slice() });
    }, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [con]);

  if (!snap) return null;
  const { level, stats, net, pos } = snap;
  const fmt = (v: { x: number; y: number; z: number }, d = 2) => `${v.x.toFixed(d)} ${v.y.toFixed(d)} ${v.z.toFixed(d)}`;
  return (
    <div className="tf2g-netgraph" aria-hidden="true">
      {snap.showPos && pos ? (
        <div className="tf2g-netgraph-block">
          <div>{t('ng_pos', { defaultValue: 'pos:  {{v}}', v: fmt(pos.origin) })}</div>
          <div>{t('ng_ang', { defaultValue: 'ang:  {{v}}', v: fmt(pos.angles) })}</div>
          <div>{t('ng_vel', { defaultValue: 'vel:  {{n}}', n: Math.hypot(pos.velocity.x, pos.velocity.y).toFixed(2) })}</div>
        </div>
      ) : null}
      {level > 0 && stats ? (
        <div className="tf2g-netgraph-block">
          <div>
            {t('ng_fps', { defaultValue: 'fps: {{n}}', n: Math.round(stats.fps) })}
            {'  '}
            {stats.pingMs === null ? t('ng_local', { defaultValue: 'local' }) : t('ng_ping', { defaultValue: 'ping: {{n}} ms', n: Math.round(stats.pingMs) })}
          </div>
          {net ? (
            <div>
              {t('ng_in', { defaultValue: 'in : {{kb}} k/s  {{pps}}/s', kb: kb(net.inBytesPerSec), pps: Math.round(net.inPacketsPerSec) })}
              <br />
              {t('ng_out', { defaultValue: 'out: {{kb}} k/s  {{pps}}/s', kb: kb(net.outBytesPerSec), pps: Math.round(net.outPacketsPerSec) })}
            </div>
          ) : null}
          {level >= 2 && net ? (
            <div>
              {t('ng_loss', { defaultValue: 'loss: {{loss}}%  choke: {{choke}}%', loss: Math.round(net.lossPct), choke: Math.round(net.chokePct) })}
              {net.jitterMs !== undefined ? (
                <>
                  {'  '}
                  {t('ng_jitter', { defaultValue: 'jitter: {{n}} ms', n: Math.round(net.jitterMs) })}
                </>
              ) : null}
              <br />
              {t('ng_rate', { defaultValue: 'updaterate: {{n}}/s', n: net.updateRate.toFixed(1) })}
            </div>
          ) : null}
          {level >= 3 ? (
            <div>
              {t('ng_frame', { defaultValue: 'frame: {{ms}} ms  {{tier}} ×{{scale}}', ms: stats.frameMs.toFixed(1), tier: stats.tier, scale: stats.resolutionScale.toFixed(2) })}
              <br />
              {Object.entries(stats.phases ?? {})
                .map(([k, v]) => `${k} ${v.toFixed(1)}`)
                .join('  ')}
              <br />
              {t('ng_draw', { defaultValue: 'draws: {{calls}}  tris: {{tris}}  ents: {{ents}}', calls: stats.drawCalls, tris: stats.triangles, ents: stats.entities })}
            </div>
          ) : null}
          {level >= 4 ? (
            <div className="tf2g-netgraph-graph">
              {snap.frames.map((ms, i) => (
                <span key={i} data-slow={ms > 33.4 || undefined} style={{ height: `${Math.min(100, (ms / 50) * 100)}%` }} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
