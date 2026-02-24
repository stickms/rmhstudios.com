"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BouncyCard } from "@/components/ui/BouncyCard";
import { ProximityText } from "@/components/ui/ProximityText";
import { Star } from "lucide-react";

const ALL_TESTIMONIALS = [
  {
    id: 1,
    quote: "RMH Studios creates experiences that linger in your mind long after the credits roll. Absolutely phenomenal storytelling.",
    author: "Alex Chen",
    role: "Senior Game Editor, PixelDaily",
    stars: 5,
  },
  {
    id: 2,
    quote: "The attention to visual detail and atmospheric depth in their projects is unmatched in the indie scene.",
    author: "Sarah Jenkins",
    role: "Visual Director, ArtFlow",
    stars: 5,
  },
  {
    id: 3,
    quote: "Finally, a studio that understands how to blend gameplay mechanics with narrative seamlessly. Can't wait for what's next.",
    author: "Marcus Thorne",
    role: "Lead Developer, IndieCore",
    stars: 5,
  },
  {
    id: 4,
    quote: "Slice It has genuinely become my go-to rhythm game. The beatmap generation is surprisingly accurate and the UI is gorgeous.",
    author: "Priya Rajan",
    role: "Rhythm Game Streamer",
    stars: 5,
  },
  {
    id: 5,
    quote: "I showed Signal Forge to my students as an example of creative game design. They were hooked immediately.",
    author: "David Morales",
    role: "Game Design Instructor, NYU",
    stars: 5,
  },
  {
    id: 6,
    quote: "The web-first approach is bold and it pays off. No downloads, no installs, just instant fun. More studios should do this.",
    author: "Julien Favre",
    role: "Tech Journalist, WebGaming.co",
    stars: 5,
  },
  {
    id: 7,
    quote: "Echoes of Creation genuinely moved me. The way music and visuals intertwine is unlike anything I've experienced in a browser.",
    author: "Lena Okoro",
    role: "Creative Technologist",
    stars: 5,
  },
  {
    id: 8,
    quote: "Clean code, smooth animations, zero jank. RMH Studios is proof that indie doesn't have to mean rough around the edges.",
    author: "Tom Sato",
    role: "Frontend Engineer, Vercel",
    stars: 5,
  },
  {
    id: 9,
    quote: "I've been following the devlog since day one. The transparency and passion in every update is refreshing in an industry full of silence.",
    author: "Rina Volkov",
    role: "Community Manager, IndieDB",
    stars: 5,
  },
  {
    id: 10,
    quote: "Played House Always Wins on a whim and ended up staying for two hours. The probability mechanics are clever and addictive.",
    author: "Carlos Gutierrez",
    role: "Casual Gamer & Blogger",
    stars: 5,
  },
  {
    id: 11,
    quote: "The multiplayer in Slice It is buttery smooth. Played with friends across three time zones with zero desync issues.",
    author: "Nadia Kim",
    role: "Esports Commentator",
    stars: 5,
  },
  {
    id: 12,
    quote: "As a fellow indie dev, I really respect the craft here. Every pixel feels intentional. Looking forward to future collaborations.",
    author: "Oscar Lindström",
    role: "Indie Developer, LunarByte",
    stars: 5,
  },
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState(() => ALL_TESTIMONIALS.slice(0, 3));

  useEffect(() => {
    setTestimonials(pickRandom(ALL_TESTIMONIALS, 3));
  }, []);

  return (
    <section
      id="testimonials"
      className="relative min-h-screen flex flex-col pt-20 overflow-hidden bg-linear-to-b from-(--neon-cyan)/20 to-(--neon-pink)/20"
    >
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-(--neon-cyan)/50 to-transparent opacity-50" />

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none" />

      <div className="grow flex flex-col justify-center px-4 py-20 relative z-10">
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
              Real feedback from players, creators, and the community.
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
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <BouncyCard className="h-full flex flex-col justify-between p-8">
                  <div>
                    <div className="flex gap-0.5 mb-4">
                      {Array.from({ length: t.stars }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-(--neon-cyan) text-(--neon-cyan)" />
                      ))}
                    </div>
                    <p className="text-lg text-white/90 italic leading-relaxed mb-6">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>

                  <div className="border-t border-white/10 pt-4 mt-auto">
                    <div className="font-bold text-(--neon-pink)">
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
