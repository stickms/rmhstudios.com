"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { games } from "@/lib/games";

export function AboutSection() {
  return (
    <section id="about" className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-site-bg">
      {/* Subtle top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-site-border to-transparent" />

      <div className="grow flex flex-col justify-center px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto relative z-10 w-full">
          <SectionHeading title="About RMH Studios" className="mb-8" />

          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p className="text-lg md:text-xl text-site-text-muted leading-relaxed text-center">
              RMH Studios is an indie game studio building playable experiences
              right in your browser. No downloads, no installs—just games that
              push the limits of what the web can do.
            </p>

            <p className="text-lg md:text-xl text-site-text-muted leading-relaxed text-center">
              From rhythm games to roguelikes, every project is handcrafted with
              care. We obsess over feel, performance, and polish because we
              believe great games deserve great craft—no matter the platform.
            </p>

            <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "Founded", value: "2026" },
                { label: "Games", value: `${games.length - 1}+` },
                { label: "Platform", value: "Web" },
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
                  <div className="text-3xl md:text-4xl font-black text-site-text">
                    {stat.value}
                  </div>
                  <div className="text-site-text-dim text-sm mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
