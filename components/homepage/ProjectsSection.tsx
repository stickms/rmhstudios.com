"use client";

import { motion } from "framer-motion";
import { FlipCard } from "@/components/ui/FlipCard";
import { ProximityText } from "@/components/ui/ProximityText";
import { SiSteam } from "react-icons/si";
import { Rocket, BookOpen, Brain, X, Music, Play, Zap, Swords, Crown, BrainCircuit, Gamepad2 } from "lucide-react";
import { games } from "@/lib/games";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Zap, Brain, BrainCircuit, BookOpen, Rocket, Swords, Music, Crown, Gamepad2,
};

function ProjectIcon({ name }: { name: string }) {
  const Icon = iconMap[name] || Brain;
  return <Icon className="w-20 h-20 text-white/80" strokeWidth={1} />;
}

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
            {games.map((project, index) => {
              // Standard Card Content (Front) for all cards
              const CardContent = (
                <>
                  <div
                    className={`h-40 rounded-lg bg-gradient-to-br ${project.gradient} mb-4 flex items-center justify-center relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="w-full h-full p-4 relative z-10 flex items-center justify-center">
                      <ProjectIcon name={project.iconName} />
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
                                  href={project.href}
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
                                  href={project.href}
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
