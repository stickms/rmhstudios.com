'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { AGENTS, getAgent, ROLE_LABEL } from '@/lib/breakpoint/agents';
import type { Actor } from '@/lib/breakpoint/types';
import { Character } from './arena/Character';
import { PIXEL_SCALE_DESKTOP } from '@/lib/breakpoint/constants';

function previewActor(agentId: string): Actor {
  return {
    id: 'preview', name: 'preview', kind: 'bot', team: 'attackers', agentId, isLocal: false,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, onGround: true, crouch: false,
    hp: 100, maxHp: 100, armor: 0, alive: true, credits: 0,
    loadout: { primary: null, sidearm: 'classic', armor: 0, abilities: {} },
    currentWeapon: 'classic', ammo: 0, reserve: 0, reloading: false, reloadEnd: 0, lastShot: 0, recoil: 0,
    abilityCharges: {}, ultPoints: 0, blindUntil: 0, healUntil: 0, shieldHp: 0,
    revealedUntil: 0, speedBoostUntil: 0, hasSpike: false,
    kills: 0, deaths: 0, assists: 0, score: 0,
    anim: { moveSpeed: 0, firing: 0, casting: 0, hitFlash: 0, deathTime: 0 },
  };
}

function Spinner({ actor }: { actor: Actor }) {
  useFrame((_, dt) => { actor.yaw += dt * 0.6; });
  return <Character actor={actor} />;
}

export function AgentSelect() {
  const selected = useBreakpointStore((s) => s.selectedAgent);
  const setSelected = useBreakpointStore((s) => s.setSelectedAgent);
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const agentReturn = useBreakpointStore((s) => s.agentReturn);
  const actorRef = useRef<Actor>(previewActor(selected));
  // keep preview actor in sync with selection
  actorRef.current.agentId = selected;
  const agent = getAgent(selected);

  return (
    <div className="bp-agentselect">
      <div className="bp-as-top">
        <button className="bp-back" onClick={() => setPhase(agentReturn)}>← BACK</button>
        <div className="bp-as-heading">SELECT YOUR AGENT</div>
        <button className="bp-cta bp-cta-sm" onClick={() => setPhase(agentReturn)}>LOCK IN →</button>
      </div>

      <div className="bp-as-body">
        {/* agent grid */}
        <div className="bp-as-grid">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              className={`bp-as-card ${selected === a.id ? 'sel' : ''}`}
              style={{ ['--c' as string]: a.color }}
              onClick={() => setSelected(a.id)}
            >
              <div className="bp-as-cardname">{a.name}</div>
              <div className="bp-as-cardrole">{ROLE_LABEL[a.role]}</div>
            </button>
          ))}
        </div>

        {/* preview */}
        <div className="bp-as-preview">
          <motion.div key={selected} className="bp-as-name" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            <h2 style={{ color: agent.color }}>{agent.name}</h2>
            <div className="bp-as-rolebadge" style={{ borderColor: agent.color, color: agent.color }}>{ROLE_LABEL[agent.role]}</div>
          </motion.div>
          <div className="bp-as-canvas">
            <Canvas dpr={PIXEL_SCALE_DESKTOP} gl={{ antialias: false }} camera={{ position: [0, 1.1, 3.4], fov: 42 }} style={{ imageRendering: 'pixelated' }}>
              <hemisphereLight args={['#aab', '#223', 1.2]} />
              <directionalLight position={[3, 6, 4]} intensity={1.4} />
              <Spinner actor={actorRef.current} />
            </Canvas>
          </div>
          <p className="bp-as-blurb">{agent.blurb}</p>
        </div>

        {/* abilities */}
        <div className="bp-as-abilities">
          <div className="bp-as-abtitle">ABILITIES</div>
          {agent.abilities.map((ab) => (
            <div key={ab.id} className="bp-as-ability" style={{ borderColor: ab.color }}>
              <div className="bp-as-abkey" style={{ background: ab.color }}>{ab.slot}</div>
              <div className="bp-as-abinfo">
                <div className="bp-as-abname">{ab.name} {ab.slot === 'X' && <span className="bp-ult-tag">ULT</span>}</div>
                <div className="bp-as-abdesc">{ab.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
