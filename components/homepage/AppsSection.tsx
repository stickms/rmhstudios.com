"use client";

import { motion } from "framer-motion";
import { ProximityText } from "@/components/ui/ProximityText";
import { apps } from "@/lib/apps";
import { GameCarousel } from "@/components/game/GameCarousel";

export function AppsSection() {
  return (
    <section id="apps" className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-linear-to-b from-black via-(--neon-purple)/10 to-black">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-(--neon-purple)/50 to-transparent opacity-50" />

      {/* Background Ambience */}
      <div className="absolute inset-0 to-(--neon-purple)/10 pointer-events-none" />

      <div className="grow flex flex-col justify-center py-20 relative z-10 w-full overflow-hidden">
        <div className="max-w-7xl mx-auto w-full px-4 mb-12">
          {/* Section header */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black">
              <ProximityText maxScale={1.3} proximity={150}>
                Our Apps
              </ProximityText>
            </h2>
            <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
              Powerful utilities and tools built for the community
            </p>
          </motion.div>
        </div>

        {/* Carousel - Full Screen Width */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="w-full"
        >
          <GameCarousel games={apps.filter((a) => !a.hidden) as any} />
        </motion.div>
      </div>
    </section>
  );
}
