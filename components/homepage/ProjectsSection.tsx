"use client";

import { motion } from "framer-motion";
import { BouncyCard } from "@/components/ui/BouncyCard";
import { ProximityText } from "@/components/ui/ProximityText";

const projects = [
  {
    id: 1,
    title: "Project Nova",
    description:
      "An expansive sci-fi adventure that pushes the boundaries of exploration and discovery.",
    status: "In Development",
    gradient: "from-[var(--neon-pink)] to-[var(--neon-purple)]",
    svg: (
        <svg viewBox="0 0 200 200" className="w-full h-full opacity-80 group-hover:scale-110 transition-transform duration-500">
            <circle cx="100" cy="100" r="40" fill="none" stroke="white" strokeWidth="2" />
            <path d="M60 100 Q100 60 140 100 T220 100" fill="none" stroke="white" strokeWidth="2" opacity="0.5" />
            <circle cx="150" cy="50" r="10" fill="white" opacity="0.8" />
            <path d="M100 20 L100 40M100 160 L100 180M20 100 L40 100M160 100 L180 100" stroke="white" strokeWidth="2" opacity="0.3" />
        </svg>
    )
  },
  {
    id: 2,
    title: "Neon Rush",
    description:
      "High-octane racing through cyberpunk cityscapes with dynamic weather and day/night cycles.",
    status: "Coming Soon",
    gradient: "from-[var(--neon-cyan)] to-[var(--neon-blue)]",
    svg: (
        <svg viewBox="0 0 200 200" className="w-full h-full opacity-80 group-hover:scale-110 transition-transform duration-500">
             <path d="M50 120 L150 120 L140 100 L60 100 Z" fill="none" stroke="white" strokeWidth="3" />
             <circle cx="70" cy="120" r="12" fill="none" stroke="white" strokeWidth="3" />
             <circle cx="130" cy="120" r="12" fill="none" stroke="white" strokeWidth="3" />
             {/* Speed lines */}
             <path d="M20 100 L40 100" stroke="white" strokeWidth="2" opacity="0.6" />
             <path d="M10 110 L30 110" stroke="white" strokeWidth="2" opacity="0.6" />
             <path d="M30 90 L50 90" stroke="white" strokeWidth="2" opacity="0.6" />
        </svg>
    )
  },
  {
    id: 3,
    title: "Echoes",
    description:
      "A narrative-driven puzzle game exploring memory, identity, and the nature of reality.",
    status: "In Development",
    gradient: "from-[var(--neon-purple)] to-[var(--neon-pink)]",
    svg: (
        <svg viewBox="0 0 200 200" className="w-full h-full opacity-80 group-hover:scale-110 transition-transform duration-500">
             <rect x="70" y="70" width="60" height="60" rx="10" fill="none" stroke="white" strokeWidth="3" transform="rotate(45 100 100)" />
             <path d="M100 70 L100 130 M70 100 L130 100" stroke="white" strokeWidth="2" />
             <circle cx="100" cy="100" r="15" fill="none" stroke="white" strokeWidth="2" />
             <path d="M100 40 L100 50" stroke="white" strokeWidth="2" opacity="0.5" />
        </svg>
    )
  },
];

export function ProjectsSection() {
  return (
    <section id="projects" className="relative min-h-screen flex flex-col pt-20">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-[var(--neon-cyan)]/10 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/30 to-transparent" />

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <BouncyCard className="h-full group">
                  {/* Styled Thumbnail Container with SVG */}
                  <div
                    className={`h-40 rounded-lg bg-gradient-to-br ${project.gradient} mb-4 flex items-center justify-center relative overflow-hidden`}
                  >
                     <div className="absolute inset-0 bg-black/20" /> {/* Overlay for better SVG visibility */}
                     <div className="w-full h-full p-4 relative z-10">
                        {project.svg}
                     </div>
                  </div>

                  {/* Status badge */}
                  <span className="inline-block px-3 py-1 text-xs font-bold rounded-full bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border border-[var(--neon-pink)]/30 badge-pulse">
                    {project.status}
                  </span>

                  {/* Title */}
                  <h3 className="text-xl md:text-2xl font-bold text-white mt-3">
                    {project.title}
                  </h3>

                  {/* Description */}
                  <p className="text-white/60 mt-2 text-sm md:text-base">
                    {project.description}
                  </p>
                </BouncyCard>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation buttons - REMOVED for Global Button */}
    </section>
  );
}
