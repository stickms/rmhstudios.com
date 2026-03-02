"use client";

import { apps } from "@/lib/apps";
import { GameCarousel } from "@/components/game/GameCarousel";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { motion } from "framer-motion";

export function AppsSection() {
  return (
    <section id="apps" className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-site-bg-subtle">
      {/* Subtle top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-site-border to-transparent" />

      <div className="grow flex flex-col justify-center py-20 relative z-10 w-full overflow-hidden">
        <div className="max-w-7xl mx-auto w-full px-4 mb-12">
          <SectionHeading
            title="Our Apps"
            subtitle="Powerful utilities and tools built for the community"
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="w-full"
        >
          <GameCarousel games={apps.filter((a) => !a.hidden) as any} />
        </motion.div>
      </div>
    </section>
  );
}
