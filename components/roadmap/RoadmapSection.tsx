"use client";

import { motion } from "framer-motion";

type Milestone = {
  title: string;
  body: string;
};

type YearSection = {
  year: string;
  tagline: string;
  milestones: Milestone[];
};

const roadmap: YearSection[] = [
  {
    year: "Year 1",
    tagline: "Foundation",
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
    year: "Year 5",
    tagline: "Transmedia",
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
  {
    year: "Years 6\u20137",
    tagline: "Global reach",
    milestones: [
      {
        title: "Third major IP",
        body: "Launch a new franchise in an unexplored genre\u2014strategy, open-world, or life-sim\u2014built on proprietary engine tech.",
      },
      {
        title: "Localization at scale",
        body: "Full localization across 20+ languages. Regional community managers and culture-specific events.",
      },
      {
        title: "RMH Esports League",
        body: "Formalize competitive play for Resoundings of Calamity and future PvP titles with seasonal circuits and prize pools.",
      },
      {
        title: "Soundtrack label",
        body: "Launch a music label for game OSTs and original compositions. Vinyl pressings, streaming, and live concert tours.",
      },
      {
        title: "Developer tools",
        body: "Open-source internal tools\u2014level editors, procedural generators, narrative scripting frameworks\u2014for the modding community.",
      },
    ],
  },
  {
    year: "Years 8\u201310",
    tagline: "Industry pillar",
    milestones: [
      {
        title: "RMH Engine",
        body: "Ship a proprietary game engine refined from a decade of titles. License it to indie studios with generous terms.",
      },
      {
        title: "Education initiative",
        body: "Launch RMH Academy\u2014free courses, mentorships, and game jams for aspiring developers. Partner with schools worldwide.",
      },
      {
        title: "Theme park attraction",
        body: "Partner with a major entertainment venue for a walk-through immersive experience set in the Calamity universe.",
      },
      {
        title: "Cross-IP crossover",
        body: "Major crossover event uniting characters and worlds from all RMH franchises into a shared narrative season.",
      },
      {
        title: "Publishing arm",
        body: "Begin publishing select indie titles under the RMH banner\u2014funding, QA, marketing, and distribution support.",
      },
      {
        title: "Live service mastery",
        body: "Decade of live ops expertise. Seasonal content pipelines, dynamic world events, and zero-downtime updates across all titles.",
      },
    ],
  },
  {
    year: "Years 11\u201315",
    tagline: "Next frontier",
    milestones: [
      {
        title: "Persistent open world",
        body: "A massively multiplayer persistent world spanning all RMH IPs. Seamless transitions between biomes, eras, and genres.",
      },
      {
        title: "AI-driven NPCs",
        body: "Deploy conversational AI characters with memory, goals, and emergent behavior. Every NPC has a story worth hearing.",
      },
      {
        title: "Haptic & spatial computing",
        body: "Full-body haptic support and mixed-reality integration. Play in your living room or a warehouse-scale arena.",
      },
      {
        title: "Interactive film",
        body: "Release a feature-length interactive film where viewer choices branch the narrative in real time, rendered in-engine.",
      },
      {
        title: "RMH Foundation",
        body: "Establish a nonprofit arm funding game accessibility, mental health research through play, and preservation of digital art.",
      },
      {
        title: "Player-created worlds",
        body: "Full mod-to-marketplace pipeline. Players build, publish, and monetize custom worlds inside the RMH ecosystem.",
      },
    ],
  },
  {
    year: "Years 16\u201320",
    tagline: "Beyond gaming",
    milestones: [
      {
        title: "Neural interface R&D",
        body: "Partner with BCI researchers to prototype thought-assisted controls\u2014accessibility-first, then mainstream.",
      },
      {
        title: "Digital twin cities",
        body: "Build photorealistic digital twins of real cities inside the engine. Use them for urban planning, tourism, and gameplay.",
      },
      {
        title: "Autonomous world simulation",
        body: "Worlds that evolve when no one is playing. Ecosystems, economies, and civilizations that persist and surprise returning players.",
      },
      {
        title: "RMH Pictures",
        body: "Full-fledged film and animation studio producing theatrical releases, streaming series, and shorts\u2014all set in RMH universes.",
      },
      {
        title: "Space partnership",
        body: "Collaborate with a space agency or private mission to deliver entertainment experiences for long-duration spaceflight crews.",
      },
    ],
  },
  {
    year: "Years 21\u201325",
    tagline: "Living worlds",
    milestones: [
      {
        title: "Full-dive prototype",
        body: "First-generation full sensory immersion. Smell the rain, feel the wind, taste the victory. Limited beta for the bravest players.",
      },
      {
        title: "Generative universes",
        body: "Procedurally generated galaxies with unique physics, biology, and cultures. No two players discover the same star system.",
      },
      {
        title: "AI co-directors",
        body: "AI systems that dynamically author narrative arcs tailored to each player\u2019s history, choices, and emotional state.",
      },
      {
        title: "Cultural institution",
        body: "RMH works archived in museums and libraries. Academic programs study the studio\u2019s worlds as modern mythology.",
      },
      {
        title: "Decentralized governance",
        body: "Community councils with real authority over world lore, seasonal direction, and studio-funded creative grants.",
      },
    ],
  },
  {
    year: "Years 26\u201330",
    tagline: "Legacy",
    milestones: [
      {
        title: "Consciousness playground",
        body: "Shared dreamlike spaces where players co-create reality through intention. The line between player and creator dissolves.",
      },
      {
        title: "Interplanetary entertainment",
        body: "RMH experiences running on off-world habitats. Latency-optimized, locally persistent worlds for lunar and Martian colonies.",
      },
      {
        title: "Self-evolving engine",
        body: "The engine rewrites and optimizes itself. New genres, mechanics, and art styles emerge from the system without human prompting.",
      },
      {
        title: "Immortal worlds",
        body: "Worlds that outlive their creators. Self-sustaining ecosystems of player content, AI storytelling, and community governance run indefinitely.",
      },
      {
        title: "The mission",
        body: "Thirty years in, the mission is the same: build worlds worth living in. Every pixel, every note, every story\u2014crafted so someone, somewhere, feels less alone.",
      },
    ],
  },
];

function MilestoneCard({
  title,
  body,
  index,
}: {
  title: string;
  body: string;
  index: number;
}) {
  return (
    <motion.div
      data-slot="card"
      className="border border-site-border bg-site-surface backdrop-blur-sm p-5 transition-colors hover:border-site-accent/30 hover:bg-site-surface-hover"
      style={{
        borderRadius: "var(--site-radius)",
        borderWidth: "var(--site-border-width)",
      }}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-site-accent">
        {title}
      </h3>
      <p className="text-site-text-muted text-sm leading-relaxed">{body}</p>
    </motion.div>
  );
}

export function RoadmapSection() {
  return (
    <section className="relative min-h-screen pt-24 pb-32 overflow-hidden bg-site-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-3 font-(family-name:--font-nunito) text-site-text">
            The Road <span className="text-site-accent">Ahead</span>
          </h1>
          <p className="text-lg text-site-text-muted max-w-xl mx-auto">
            Games, community, immersive tech, and film—one step at a time.
          </p>
        </motion.div>

        {/* Intro */}
        <motion.div
          className="mb-16 rounded-xl border border-site-border bg-site-surface backdrop-blur-sm p-5 md:p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <p className="text-site-text-muted text-sm md:text-base leading-relaxed">
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
              <div className="flex flex-wrap items-baseline gap-2 mb-6 pl-4 border-l-2 border-site-accent">
                <span className="text-2xl md:text-3xl font-black text-site-accent">
                  {section.year}
                </span>
                <span className="text-site-text-dim font-mono text-sm uppercase tracking-wider">
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
                    index={i}
                  />
                ))}
              </div>
            </motion.section>
          ))}
        </div>

        <motion.p
          className="text-center text-site-text-dim text-xs mt-14"
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
