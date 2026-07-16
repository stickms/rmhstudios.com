'use client';

import { m as motion } from 'framer-motion';
import type { MatchSnapshot, Actor, Team } from '@/lib/breakpoint/types';
import { getAgent } from '@/lib/breakpoint/agents';

export function Scoreboard({ snap }: { snap: MatchSnapshot }) {
  const att = snap.actors.filter((a) => a.team === 'attackers').sort((a, b) => b.kills - a.kills);
  const def = snap.actors.filter((a) => a.team === 'defenders').sort((a, b) => b.kills - a.kills);
  const isZombies = snap.mode === 'zombies';

  if (isZombies) {
    return (
      <motion.div className="bp-scoreboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="bp-sb-header">
          <span className="bp-sb-vs">ROCHESTER OFFENSIVE · ZOMBIES · WAVE {snap.wave}/10</span>
        </div>
        <TeamTable title="SURVIVORS" team="attackers" actors={att} localTeam={snap.localTeam} />
      </motion.div>
    );
  }

  return (
    <motion.div className="bp-scoreboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="bp-sb-header">
        <span className="bp-sb-score att">{snap.scoreAttackers}</span>
        <span className="bp-sb-vs">ROCHESTER OFFENSIVE · MR13</span>
        <span className="bp-sb-score def">{snap.scoreDefenders}</span>
      </div>
      <TeamTable title="ATTACKERS" team="attackers" actors={att} localTeam={snap.localTeam} />
      <TeamTable title="DEFENDERS" team="defenders" actors={def} localTeam={snap.localTeam} />
    </motion.div>
  );
}

function TeamTable({ title, team, actors, localTeam }: { title: string; team: Team; actors: Actor[]; localTeam: Team }) {
  const color = team === 'attackers' ? '#ff4655' : '#3b6fe0';
  return (
    <div className="bp-sb-team">
      <div className="bp-sb-teamtitle" style={{ color }}>{title} {team === localTeam ? '(YOU)' : ''}</div>
      <div className="bp-sb-row bp-sb-rowhead">
        <span>AGENT</span><span>PLAYER</span><span>K</span><span>D</span><span>A</span><span>CR</span>
      </div>
      {actors.map((a) => {
        const agent = getAgent(a.agentId);
        return (
          <div key={a.id} className={`bp-sb-row ${a.isLocal ? 'me' : ''} ${!a.alive ? 'dead' : ''}`}>
            <span className="bp-sb-agent" style={{ color: agent.color }}>{agent.name}</span>
            <span className="bp-sb-name">{a.name}{a.hasSpike ? ' 💣' : ''}</span>
            <span>{a.kills}</span><span>{a.deaths}</span><span>{a.assists}</span>
            <span>⬡{a.credits}</span>
          </div>
        );
      })}
    </div>
  );
}
