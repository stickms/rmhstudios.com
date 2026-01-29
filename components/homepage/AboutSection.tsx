"use client";

import { motion } from "framer-motion";
import { FloatingElement } from "@/components/ui/FloatingElement";
import { PulsatingOrb } from "@/components/ui/PulsatingOrb";
import { ProximityText } from "@/components/ui/ProximityText";

export function AboutSection() {
  return (
    <section id="about" className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-gradient-to-b from-black via-[var(--neon-cyan)]/5 to-[var(--neon-cyan)]/20">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/30 to-transparent opacity-50" />

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none" />

      <div className="flex-grow flex flex-col justify-center px-4 py-20 relative z-10">
        {/* Background orbs */}
        <PulsatingOrb
          className="absolute top-1/4 right-0 translate-x-1/2"
          color="cyan"
          size="lg"
        />
        <PulsatingOrb
          className="absolute bottom-1/4 left-0 -translate-x-1/2"
          color="purple"
          size="lg"
        />

        <div className="max-w-4xl mx-auto relative z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <FloatingElement intensity={10}>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-8 text-center">
                <span className="block sm:hidden">
                  <ProximityText maxScale={1.2} proximity={120}>
                    About
                  </ProximityText>
                  <br />
                  <ProximityText maxScale={1.2} proximity={120}>
                    RMH Studios
                  </ProximityText>
                </span>
                <span className="hidden sm:inline">
                  <ProximityText maxScale={1.3} proximity={150}>
                    About RMH Studios
                  </ProximityText>
                </span>
              </h2>
            </FloatingElement>
          </motion.div>

          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-lg md:text-xl text-white/80 leading-relaxed text-center">
              We are an indie game development studio driven by passion and
              creativity. Our mission is to craft immersive digital experiences
              that push the boundaries of interactive entertainment.
            </p>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed text-center">
              Every project we undertake is a labor of love, combining innovative
              gameplay mechanics with stunning visuals and compelling narratives.
              We believe games are more than entertainment—they&apos;re art.
            </p>

            <div className="pt-8 grid grid-cols-2 md:grid-cols-3 gap-6">
              {[
                { label: "Founded", value: "2026" },
                { label: "Projects", value: "3+" },
                { label: "Passion", value: "100%" },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  className="text-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <div className="text-3xl md:text-4xl font-black">
                    <ProximityText maxScale={1.2} proximity={100}>
                      {stat.value}
                    </ProximityText>
                  </div>
                  <div className="text-white/50 text-sm mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Navigation button - REMOVED for Global Button */}
    </section>
  );
}
