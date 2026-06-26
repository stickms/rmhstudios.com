'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MatchSnapshot, Actor } from '@/lib/breakpoint/types';
import { getAgent } from '@/lib/breakpoint/agents';
import { getWeapon } from '@/lib/breakpoint/weapons';
import { ROUNDS_TO_WIN } from '@/lib/breakpoint/constants';
import { Minimap } from './Minimap';

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `0:${s.toString().padStart(2, '0')}`;
}

export function HUD({ snap }: { snap: MatchSnapshot }) {
  const local = snap.actors.find((a) => a.isLocal);
  const isBlinded = !!local && local.blindUntil > snap.now;

  if (!local) return null;
  const agent = getAgent(local.agentId);
  const wpn = getWeapon(local.currentWeapon);
  const attColor = '#ff4655';
  const defColor = '#16e0a3';
  const localIsAtt = snap.localTeam === 'attackers';

  const timeLeft = snap.phaseEndsAt - snap.now;

  return (
    <div className="bp-hud">
      {/* ── Top bar: score + timer ── */}
      {snap.mode === 'zombies' ? (
        <div className="bp-topbar">
          <div className="bp-timer-block" style={{ minWidth: 280 }}>
            <div className={`bp-timer ${snap.phase === 'buy' ? '' : 'bp-timer-spike'}`}>
              {snap.phase === 'buy' ? `PREP ${fmtTime(timeLeft)}` : `WAVE ${snap.wave}`}
            </div>
            <div className="bp-round-label">
              {snap.phase === 'buy' ? `WAVE ${snap.wave} / ${10} INCOMING` : `${snap.zombiesLeft} ZOMBIES LEFT · WAVE ${snap.wave}/10`}
            </div>
          </div>
        </div>
      ) : (
        <div className="bp-topbar">
          <div className="bp-score-side bp-score-att" style={{ borderColor: attColor }}>
            <span className="bp-score-num" style={{ color: attColor }}>{snap.scoreAttackers}</span>
          </div>
          <div className="bp-timer-block">
            <div className={`bp-timer ${snap.phase === 'planted' ? 'bp-timer-spike' : ''}`}>
              {snap.phase === 'planted' ? 'SPIKE' : fmtTime(timeLeft)}
            </div>
            <div className="bp-roundpips">
              {Array.from({ length: ROUNDS_TO_WIN }).map((_, i) => (
                <span key={`a${i}`} className="bp-pip" style={{ background: i < snap.scoreAttackers ? attColor : 'transparent', borderColor: attColor }} />
              ))}
            </div>
            <div className="bp-round-label">ROUND {snap.round}</div>
          </div>
          <div className="bp-score-side bp-score-def" style={{ borderColor: defColor }}>
            <span className="bp-score-num" style={{ color: defColor }}>{snap.scoreDefenders}</span>
          </div>
        </div>
      )}

      {/* ── Minimap ── */}
      <div className="bp-minimap-wrap">
        <Minimap snap={snap} />
      </div>

      {/* ── Kill feed ── */}
      <div className="bp-killfeed">
        <AnimatePresence>
          {snap.killFeed.slice(0, 5).map((k) => (
            <motion.div
              key={k.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="bp-kf-row"
            >
              <span style={{ color: k.killerTeam === 'attackers' ? attColor : defColor }}>{k.killer}</span>
              <span className="bp-kf-weapon">{k.headshot ? '◎' : '›'} {k.weapon}</span>
              <span style={{ color: k.victimTeam === 'attackers' ? attColor : defColor }}>{k.victim}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Crosshair ── */}
      {local.alive && (
        <div className="bp-crosshair" style={{ ['--spread' as string]: `${4 + local.recoil * 14}px` }}>
          <span className="bp-ch bp-ch-t" /><span className="bp-ch bp-ch-b" />
          <span className="bp-ch bp-ch-l" /><span className="bp-ch bp-ch-r" />
        </div>
      )}

      {/* ── Bottom: abilities / health / ammo ── */}
      <div className="bp-bottombar">
        {/* abilities */}
        <div className="bp-abilities">
          {agent.abilities.map((ab) => {
            const charges = ab.slot === 'X' ? 0 : (local.abilityCharges[ab.id] ?? 0);
            const ultReady = ab.slot === 'X' && local.ultPoints >= (ab.ultPoints ?? 8);
            const ultProg = ab.slot === 'X' ? local.ultPoints / (ab.ultPoints ?? 8) : 1;
            const usable = ab.slot === 'X' ? ultReady : charges > 0;
            return (
              <div key={ab.id} className={`bp-ability ${usable ? 'bp-ability-on' : ''}`} style={{ borderColor: ab.color }}>
                <span className="bp-ability-key">{ab.slot}</span>
                <span className="bp-ability-name">{ab.name}</span>
                {ab.slot === 'X'
                  ? <span className="bp-ability-ult" style={{ ['--p' as string]: ultProg }}>{ultReady ? 'READY' : `${local.ultPoints}/${ab.ultPoints}`}</span>
                  : <span className="bp-ability-charges">{Array.from({ length: ab.charges }).map((_, i) => (
                      <i key={i} className={i < charges ? 'on' : ''} style={{ background: i < charges ? ab.color : 'transparent', borderColor: ab.color }} />
                    ))}</span>}
              </div>
            );
          })}
        </div>

        {/* health + armor */}
        <div className="bp-vitals">
          <div className="bp-hp-row">
            <span className="bp-hp-num">{Math.ceil(local.hp)}</span>
            {local.armor > 0 && <span className="bp-armor">🛡 {Math.ceil(local.armor)}</span>}
            {local.shieldHp > 0 && <span className="bp-shield">✦ {Math.ceil(local.shieldHp)}</span>}
          </div>
          <div className="bp-hp-bar">
            <div className="bp-hp-fill" style={{ width: `${(local.hp / local.maxHp) * 100}%`, background: localIsAtt ? attColor : defColor }} />
          </div>
        </div>

        {/* ammo + credits */}
        <div className="bp-ammo">
          <div className="bp-weapon-name">{wpn.name}</div>
          <div className="bp-ammo-num">
            <span className="bp-ammo-mag">{wpn.class === 'melee' ? '∞' : local.ammo}</span>
            {wpn.class !== 'melee' && <span className="bp-ammo-res">/ {local.reserve}</span>}
          </div>
          <div className="bp-credits">⬡ {local.credits}</div>
        </div>
      </div>

      {/* ── Spike plant / defuse progress ── */}
      {(snap.spike.planting || snap.spike.defusing) && (
        <div className="bp-spike-progress">
          <div className="bp-spike-label">{snap.spike.planting ? 'PLANTING' : 'DEFUSING'}</div>
          <div className="bp-spike-bar"><div style={{ width: `${snap.spike.progress * 100}%` }} /></div>
        </div>
      )}

      {/* ── Plant/defuse hint ── */}
      {local.alive && snap.phase !== 'buy' && (
        <PlantHint local={local} snap={snap} />
      )}

      {/* ── Round result banner ── */}
      <AnimatePresence>
        {snap.phase === 'roundEnd' && snap.lastResult && (
          <motion.div
            key={snap.lastResult.round}
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bp-round-banner"
            style={{ borderColor: snap.lastResult.winner === 'attackers' ? attColor : defColor }}
          >
            <div className="bp-rb-result" style={{ color: snap.lastResult.winner === snap.localTeam ? '#fff' : '#ff5566' }}>
              {snap.mode === 'zombies' ? `WAVE ${snap.lastResult.round} CLEARED` : snap.lastResult.winner === snap.localTeam ? 'ROUND WON' : 'ROUND LOST'}
            </div>
            <div className="bp-rb-reason">{snap.mode === 'zombies' ? 'Prepare for the next wave' : reasonText(snap.lastResult.reason)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buy phase banner */}
      {snap.phase === 'buy' && (
        <div className="bp-buy-banner">BUY PHASE — press <b>B</b> to open the store</div>
      )}

      {/* Flash overlay */}
      {isBlinded && <div className="bp-blind" />}
      {!local.alive && snap.phase !== 'roundEnd' && <div className="bp-dead-overlay">YOU DIED — spectating</div>}
    </div>
  );
}

function PlantHint({ local, snap }: { local: Actor; snap: MatchSnapshot }) {
  const attacking = snap.localTeam === (snap.actors.find((a) => a.isLocal)?.team) && local.hasSpike;
  if (local.hasSpike && !snap.spike.planted) {
    return <div className="bp-action-hint">Reach a site and hold <b>F</b> to plant the spike</div>;
  }
  if (!local.hasSpike && snap.spike.planted && snap.localTeam !== 'attackers') {
    return <div className="bp-action-hint">Hold <b>F</b> near the spike to defuse</div>;
  }
  void attacking;
  return null;
}

function reasonText(r: string): string {
  switch (r) {
    case 'elimination': return 'Enemy team eliminated';
    case 'spike': return 'Spike detonated';
    case 'defuse': return 'Spike defused';
    case 'time': return 'Time expired';
    default: return '';
  }
}
