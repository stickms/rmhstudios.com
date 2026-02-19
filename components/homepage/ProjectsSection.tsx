"use client";

import { motion } from "framer-motion";
import { FlipCard } from "@/components/ui/FlipCard";
import { ProximityText } from "@/components/ui/ProximityText";
import { SiSteam } from "react-icons/si";
import { Rocket, BookOpen, Brain, X, Music, Play, Zap, Swords, Crown } from "lucide-react";

const projects = [
  {
    id: 4,
    title: "Slice It!",
    description: "A high-octane rhythm game where you slice beats to the music.",
    longDescription: "Test your reflexes in this neon-soaked rhythm game. Slice through beats, dodge obstacles, and aim for the high score in a world that pulses to the music. Upload your own tracks or play the demo.",
    status: "Playable Demo",
    gradient: "from-[var(--neon-cyan)] to-[var(--neon-blue)]",
    icon: <Music className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play Now",
    link: "/slice-it",
    isSteam: false
  },
  {
    id: 7,
    title: "Laundry Sort",
    description: "A physics-based game where gravity and color matching are everything.",
    longDescription: "Sort falling laundry into color-matched bins using gravity and ragdoll physics. Watch as clothes tumble and bounce through the air. Earn points for correct sorts, but watch out—put a red shirt in the blue bin and you'll lose points! Features dynamic physics, vibrant colors, and addictive gameplay.",
    status: "Playable Demo",
    gradient: "from-[#ff6b6b] to-[#ee5a6f]",
    icon: <Zap className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play Now",
    link: "/laundry-sort",
    isSteam: false
  },
  {
    id: 2,
    title: "Satan's Library",
    description:
      "A survival horror where you 'lock in' to gain Knowledge and Aura while escaping succubi.",
    longDescription:
      "A survival horror where you play as an underdog in a library overrun by succubi and chadlites. Your goal: 'lock in' and build your Knowledge and Aura stats to escape. Resist temptation, survive beatdowns, and outsmart Satan (Rish) himself in this high-stakes test of willpower.",
    status: "In Development",
    gradient: "from-red-900 to-red-600",
    icon: <BookOpen className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Wishlist on Steam",
    link: "#",
    isSteam: true
  },
  {
    id: 3,
    title: "Echoes",
    description:
      "A narrative-driven puzzle game exploring memory, identity, and the nature of reality.",
    longDescription:
      "Dive into a fragmented reality where memories are currency. Solve complex narrative puzzles to piece together the truth of your existence before the entropy of the void dissolves everything you know. Features non-linear storytelling, adaptive audio landscapes, and choices that ripple across timelines.",
    status: "Playable",
    gradient: "from-[var(--neon-purple)] to-[var(--neon-pink)]",
    icon: <Brain className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play Now",
    link: "/echoes",
    isSteam: false
  },
  {
    id: 5,
    title: "RMHdle",
    description: "The daily word game for the RMH community.",
    longDescription: "A daily word challenge where you guess a 5-letter word in 6 tries. Part of the RMH Discord integration, featuring community-specific words and global competition.",
    status: "Discord Game",
    gradient: "from-[#5865F2] to-[#404EED]",
    icon: <Brain className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play on Discord",
    link: "https://discord.gg/rmh",
    isSteam: false
  },
  {
    id: 8,
    title: "Signal Forge",
    description: "A roguelike deckbuilder where you match waveform sequences to survive.",
    longDescription: "Build your deck of waveforms and match sequences to defeat enemies. Every run is different as you navigate floors of increasing difficulty. Manage your tempo, control static corruption, and discover powerful synergies. A game about composing the perfect signal.",
    status: "Playable Demo",
    gradient: "from-cyan-600 to-blue-600",
    icon: <Zap className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play Now",
    link: "/signal-forge",
    isSteam: false
  },
  {
    id: 9,
    title: "Project Vega",
    description: "A Chrono-Loop Tower Defense where you defend against intrusive thoughts.",
    longDescription: "Defend the Memory Core across 3 recursive timelines. Your towers from previous loops become 'Ghost Protocols' that assist you. Merging timelines creates Paradoxes. A clinical horror aesthetic inspired by Balatro and Pony Island.",
    status: "Prototype",
    gradient: "from-green-900 to-green-600",
    icon: <Brain className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Initialize Loop",
    link: "/vega",
    isSteam: false
  },
  {
    id: 10,
    title: "Cursed Logic",
    description: "A turn-based duel against an unstable Protocol. Commit actions in secret, resolve simultaneously.",
    longDescription: "Interface with a hostile, semi-sentient system that controls a shared reality. Each round you and the Protocol commit to one action in secret; resolution is simultaneous. The system is unstable—rules and modifiers shift between rounds. Outsmart chaos under severe resource constraint. Absurd, dark, and slightly comedic.",
    status: "Playable Demo",
    gradient: "from-cyan-900 to-amber-900",
    icon: <Swords className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Duel the Protocol",
    link: "/cursed-logic",
    isSteam: false
  },
  {
    id: 6,
    title: "RMHConnections",
    description: "Find the common threads between RMH community terms.",
    longDescription: "Group sixteen items into four categories of four. Each daily puzzle features references, history, and characters from the RMH community. Stay local or compete globally.",
    status: "Discord Game",
    gradient: "from-[#7289da] to-[#5865F2]",
    icon: <Rocket className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Play on Discord",
    link: "https://discord.gg/rmh",
    isSteam: false
  },
  {
    id: 11,
    title: "House Always Wins",
    description: "A casino metroidvania where gambling is corruption.",
    longDescription: "A dark, narrative 2D exploration-platformer inside an old, abandoned casino. Inspired by Hollow Knight, Celeste, and Undertale. Gambling never blocks progress—it only changes difficulty, debt, NPC tone, and the world around you. The house always wins, but how you play changes everything.",
    status: "In Development",
    gradient: "from-amber-950 to-neutral-900",
    icon: <Crown className="w-20 h-20 text-white/80" strokeWidth={1} />,
    cta: "Enter Casino",
    link: "/house-always-wins",
    isSteam: false
  },
];

export function ProjectsSection() {
  return (
    <section id="projects" className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-gradient-to-b from-black via-[var(--neon-cyan)]/10 to-black">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/50 to-transparent opacity-50" />
      
      {/* Background Ambience */}
      <div className="absolute inset-0 to-[var(--neon-cyan)]/10 pointer-events-none" />

      <div className="flex-grow flex flex-col justify-center px-4 py-20 relative z-10">
        <div className="max-w-6xl mx-auto w-full">
          {/* Section header */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black">
              <ProximityText maxScale={1.3} proximity={150}>
                Our Games
              </ProximityText>
            </h2>
            <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
              Ambitious projects pushing creative boundaries
            </p>
          </motion.div>

          {/* Project grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 justify-items-center">
            {projects.map((project, index) => {
              // Standard Card Content (Front) for all cards
              const CardContent = (
                <>
                  <div
                    className={`h-40 rounded-lg bg-gradient-to-br ${project.gradient} mb-4 flex items-center justify-center relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="w-full h-full p-4 relative z-10 flex items-center justify-center">
                      {project.icon}
                    </div>
                  </div>

                  <span className="inline-block px-3 py-1 text-xs font-bold rounded-full bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border border-[var(--neon-pink)]/30 badge-pulse">
                    {project.status}
                  </span>

                  <h3 className="text-xl md:text-2xl font-bold text-white mt-3">
                    {project.title}
                  </h3>

                  <p className="text-white/60 mt-2 text-sm md:text-base">
                    {project.description}
                  </p>
                </>
              );

              // Render FlipCard for ALL projects
              return (
                <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: index * 0.15 }}
                    className="h-full w-full max-w-md mx-auto"
                >
                    {/* Perspective wrapper */}
                    <div className="h-full relative group perspective-1000">
                            <FlipCard 
                            className="h-full"
                            front={
                                <div className="rounded-2xl bg-white/5 p-6 pb-12 backdrop-blur-sm border-2 border-white/10 h-full group-hover:border-[var(--neon-pink)] transition-colors">
                                    {CardContent}
                                    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[var(--neon-pink)] font-bold uppercase tracking-widest">
                                        Click to Flip ↻
                                    </div>
                                </div>
                            }
                            back={
                                <div className="rounded-2xl bg-black border-2 border-[var(--neon-purple)] h-full overflow-hidden flex flex-col shadow-[0_0_30px_rgba(153,0,255,0.5)]">
                                    {/* Header */}
                                    <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5 backdrop-blur-md shrink-0">
                                        <h3 className="text-xl font-bold text-white">{project.title}</h3>
                                        <div className="cursor-pointer" title="Close">
                                            <X className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                                        </div>
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col">
                                        <h4 className="text-[var(--neon-purple)] font-bold uppercase tracking-wider text-xs mb-3">About the Game</h4>
                                        <p className="text-sm text-white/80 leading-relaxed font-light mb-6">
                                            {project.longDescription}
                                        </p>

                                        <div className="mt-auto">
                                            {project.isSteam ? (
                                                <a 
                                                    href={project.link}
                                                    className="w-full py-3 bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#1b2838] text-[#66c0f4] font-bold text-center rounded-lg transition-all shadow-lg hover:shadow-[#66c0f4]/20 flex items-center justify-center gap-2 text-sm group/btn"
                                                    onClick={(e) => e.stopPropagation()} 
                                                >
                                                    <span className="flex items-center pb-[1px]">
                                                        <SiSteam className="w-5 h-5" />
                                                    </span>
                                                    {project.cta}
                                                </a>
                                            ) : (
                                                 <a 
                                                    href={project.link}
                                                    className="w-full py-3 bg-[var(--neon-cyan)] hover:bg-[var(--neon-blue)] text-black font-bold text-center rounded-lg transition-all shadow-lg hover:shadow-[var(--neon-cyan)]/50 flex items-center justify-center gap-2 text-sm group/btn"
                                                    onClick={(e) => e.stopPropagation()} 
                                                >
                                                    <span className="flex items-center pb-[1px]">
                                                        <Play className="w-5 h-5" />
                                                    </span>
                                                    {project.cta}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            }
                            />
                    </div>
                </motion.div>
                );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
