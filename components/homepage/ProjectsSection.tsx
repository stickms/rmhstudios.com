"use client";

import { motion } from "framer-motion";
import { BouncyCard } from "@/components/ui/BouncyCard";
import { ProximityText } from "@/components/ui/ProximityText";
import { ScrollButton } from "@/components/ui/ScrollButton";

const projects = [
  {
    id: 1,
    title: "Project Nova",
    description:
      "An expansive sci-fi adventure that pushes the boundaries of exploration and discovery.",
    status: "In Development",
    gradient: "from-[var(--neon-pink)] to-[var(--neon-purple)]",
  },
  {
    id: 2,
    title: "Neon Rush",
    description:
      "High-octane racing through cyberpunk cityscapes with dynamic weather and day/night cycles.",
    status: "Coming Soon",
    gradient: "from-[var(--neon-cyan)] to-[var(--neon-blue)]",
  },
  {
    id: 3,
    title: "Echoes",
    description:
      "A narrative-driven puzzle game exploring memory, identity, and the nature of reality.",
    status: "In Development",
    gradient: "from-[var(--neon-purple)] to-[var(--neon-pink)]",
  },
];

export function ProjectsSection() {
  return (
    <section id="projects" className="relative min-h-screen flex flex-col justify-center px-4 py-20">
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
              <BouncyCard className="h-full">
                {/* Gradient thumbnail placeholder */}
                <div
                  className={`h-40 rounded-lg bg-gradient-to-br ${project.gradient} mb-4 flex items-center justify-center`}
                >
                  <span className="text-4xl font-black text-white/20">
                    {project.title.charAt(0)}
                  </span>
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

      {/* Navigation buttons */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
        <ScrollButton targetId="about" label="About Us" />
      </div>
    </section>
  );
}
