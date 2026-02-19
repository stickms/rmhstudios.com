"use client";

import { motion } from "framer-motion";
import { ProximityText } from "@/components/ui/ProximityText";
import { PulsatingOrb } from "@/components/ui/PulsatingOrb";

type YearAccent = "var(--neon-cyan)" | "var(--neon-purple)" | "var(--neon-pink)";

type Milestone = {
  title: string;
  body: string;
};

type YearSection = {
  year: string;
  tagline: string;
  accent: YearAccent;
  milestones: Milestone[];
};

const roadmap: YearSection[] = [
  {
    year: "Year 1",
    tagline: "Foundation",
    accent: "var(--neon-cyan)",
    milestones: [
      {
        title: "Web catalog",
        body: "Ship and polish Slice It!, Laundry Sort, Signal Forge, Cursed Logic, Echoes, and Project Vega.",
      },
      {
        title: "House Always Wins",
        body: "Full launch of the casino metroidvania.",
      },
      {
        title: "Satan's Library",
        body: "Steam push and release prep for the survival horror title.",
      },
      {
        title: "Resoundings of Calamity",
        body: "Begin development on our first FPS—blistering movement, adaptive arsenal, post-apocalyptic world—alongside other new titles.",
      },
      {
        title: "Community",
        body: "Grow the RMH Discord hub. Expand RMHdle and RMHConnections with new modes and daily content. Regular devlogs and blog updates.",
      },
      {
        title: "RMH Outpost",
        body: "Launch verifiable ownership of exclusive cosmetics, digital art, and VIP playtest access. No pay-to-win.",
      },
      {
        title: "Brand",
        body: "Expand merch and visual identity.",
      },
    ],
  },
  {
    year: "Year 2",
    tagline: "Scale & variety",
    accent: "var(--neon-cyan)",
    milestones: [
      {
        title: "Satan's Library",
        body: "Steam release.",
      },
      {
        title: "Catalog updates",
        body: "Major content updates across the web catalog and ongoing support for House Always Wins, Echoes, and others.",
      },
      {
        title: "Resoundings of Calamity",
        body: "Full production—movement, arsenal, and world-building.",
      },
      {
        title: "Outpost",
        body: "Early playtest passes and cosmetic drops. Integration with community events.",
      },
      {
        title: "RMHdle & RMHConnections",
        body: "Seasonal challenges and new modes.",
      },
      {
        title: "Content",
        body: "Devlog series, behind-the-scenes, and first lore deep-dives for in-development worlds.",
      },
    ],
  },
  {
    year: "Year 3",
    tagline: "Releases & hub",
    accent: "var(--neon-purple)",
    milestones: [
      {
        title: "Resoundings of Calamity",
        body: "Release on PC and consoles. Continued support for House Always Wins, Echoes, and the rest of the catalog.",
      },
      {
        title: "VR demo",
        body: "Optional technical demo (e.g. Calamity: Scavenger)—tactile, immersive slice of the world.",
      },
      {
        title: "Persistent hub",
        body: "Open a social space where players display verified Outpost assets, trade gear, and group up before matches.",
      },
      {
        title: "Governance pilots",
        body: "Community votes on map evolution and seasonal content.",
      },
      {
        title: "TV & Film",
        body: "Partner with an animation studio for a limited series that deepens lore—faction origins, cataclysm—extending the universe beyond the game.",
      },
    ],
  },
  {
    year: "Year 4",
    tagline: "Expansion",
    accent: "var(--neon-purple)",
    milestones: [
      {
        title: "Multiplayer & expansions",
        body: "Major content and multiplayer expansions across the catalog. New experimental titles and sequels.",
      },
      {
        title: "ROC territory wars",
        body: "Faction-based territory wars, new weaponry, and live events for Resoundings of Calamity.",
      },
      {
        title: "Community governance",
        body: "Dedicated players vote on faction storylines, map evolution, and seasonal updates. Hub becomes the default hangout before matches.",
      },
      {
        title: "Animated series",
        body: "Series rollout. Short-form lore and world-building across social and site.",
      },
    ],
  },
  {
    year: "Year 5+",
    tagline: "Transmedia",
    accent: "var(--neon-pink)",
    milestones: [
      {
        title: "New IP & genres",
        body: "Second major IP. Evolve kinetic movement and signature tech into fresh experiences.",
      },
      {
        title: "VR integration",
        body: "Immersive storylines that connect to live spectator arenas.",
      },
      {
        title: "Film & TV",
        body: "Live-action or feature-length storytelling. Real-time engine rendering—lore consistent across every medium.",
      },
      {
        title: "Ecosystem",
        body: "One cohesive universe: games, community, and film support each other. RMH Studios as a persistent home at every touchpoint.",
      },
    ],
  },
];

function MilestoneCard({
  title,
  body,
  accent,
  index,
}: {
  title: string;
  body: string;
  accent: YearAccent;
  index: number;
}) {
  return (
    <motion.div
      className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <h3
        className="text-xs font-bold uppercase tracking-wider mb-2"
        style={{ color: accent }}
      >
        {title}
      </h3>
      <p className="text-white/80 text-sm leading-relaxed">{body}</p>
    </motion.div>
  );
}

export function RoadmapSection() {
  return (
    <section className="relative min-h-screen pt-24 pb-32 overflow-hidden bg-background noise">
      <PulsatingOrb
        className="absolute top-1/4 right-0 translate-x-1/2 opacity-50"
        color="cyan"
        size="lg"
      />
      <PulsatingOrb
        className="absolute bottom-1/3 left-0 -translate-x-1/2 opacity-50"
        color="purple"
        size="lg"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-3">
            <ProximityText maxScale={1.2} proximity={150}>
              The Road Ahead
            </ProximityText>
          </h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto">
            Games, community, immersive tech, and film—one step at a time.
          </p>
        </motion.div>

        {/* Intro */}
        <motion.div
          className="mb-16 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 md:p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <p className="text-white/85 text-sm md:text-base leading-relaxed">
            We&apos;re an indie studio building rhythm games, deckbuilders,
            narrative horror, and more. Our roadmap isn&apos;t tied to one
            title—we&apos;re growing the catalog, Discord, and new worlds in
            parallel. Timelines are guides, not promises.
          </p>
        </motion.div>

        {/* Year sections */}
        <div className="space-y-16">
          {roadmap.map((section, sectionIndex) => (
            <motion.section
              key={section.year}
              className="relative"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: sectionIndex * 0.06 }}
            >
              {/* Year label */}
              <div
                className="flex flex-wrap items-baseline gap-2 mb-6 pl-4 border-l-2"
                style={{ borderLeftColor: section.accent }}
              >
                <span
                  className="text-2xl md:text-3xl font-black text-white"
                  style={{ color: section.accent }}
                >
                  {section.year}
                </span>
                <span className="text-white/50 font-mono text-sm uppercase tracking-wider">
                  {section.tagline}
                </span>
              </div>

              {/* Milestone grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.milestones.map((milestone, i) => (
                  <MilestoneCard
                    key={`${section.year}-${i}`}
                    title={milestone.title}
                    body={milestone.body}
                    accent={section.accent}
                    index={i}
                  />
                ))}
              </div>
            </motion.section>
          ))}
        </div>

        <motion.p
          className="text-center text-white/40 text-xs mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          We&apos;ll update this as we ship.
        </motion.p>
      </div>
    </section>
  );
}
