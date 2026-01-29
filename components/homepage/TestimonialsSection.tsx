"use client";

import { motion } from "framer-motion";
import { BouncyCard } from "@/components/ui/BouncyCard";
import { ProximityText } from "@/components/ui/ProximityText";

const testimonials = [
  {
    id: 1,
    quote:
      "RMH Studios creates experiences that linger in your mind long after the credits roll. Absolutely phenomenal storytelling.",
    author: "Alex Chen",
    role: "Senior Game Editor, PixelDaily",
  },
  {
    id: 2,
    quote:
      "The attention to visual detail and atmospheric depth in their projects is unmatched in the indie scene.",
    author: "Sarah Jenkins",
    role: "Visual Director, ArtFlow",
  },
  {
    id: 3,
    quote:
      "Finally, a studio that understands how to blend gameplay mechanics with narrative seamlessly. Can't wait for what's next.",
    author: "Marcus Thorne",
    role: "Lead Developer, IndieCore",
  },
];

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-gradient-to-b from-[var(--neon-cyan)]/20 to-[var(--neon-pink)]/20"
    >
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/50 to-transparent opacity-50" />

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none" />

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
                What People Say
              </ProximityText>
            </h2>
            <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
              Voices from the community and critics alike
            </p>
          </motion.div>

          {/* Testimonials grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {testimonials.map((t, index) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <BouncyCard className="h-full flex flex-col justify-between p-8">
                  <div>
                    <div className="text-4xl text-[var(--neon-cyan)] mb-4 font-serif">
                      &ldquo;
                    </div>
                    <p className="text-lg text-white/90 italic leading-relaxed mb-6">
                      {t.quote}
                    </p>
                  </div>

                  <div className="border-t border-white/10 pt-4 mt-auto">
                    <div className="font-bold text-[var(--neon-pink)]">
                      {t.author}
                    </div>
                    <div className="text-sm text-white/50">{t.role}</div>
                  </div>
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
