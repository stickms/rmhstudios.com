"use client";

import { useTranslation } from "react-i18next";
import { PinnedHero } from "@/components/feed/PinnedHero";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion";

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
        body: "Ship and polish Slice It!, Laundry Sort, Signal Forge, Cursed Logic, Altair, and Project Vega.",
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
        body: "Major content updates across the web catalog and ongoing support for House Always Wins, Altair, and others.",
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
        body: "Release on PC and consoles. Continued support for House Always Wins, Altair, and the rest of the catalog.",
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
  {
    year: "Years 31\u201335",
    tagline: "Synthesis",
    milestones: [
      {
        title: "Reality composer",
        body: "A creation suite where players sculpt physics, chemistry, and biology from scratch. Design a universe with different fundamental forces and watch civilizations emerge.",
      },
      {
        title: "Emotional resonance engine",
        body: "Biometric and neural feedback loops that adapt music, lighting, narrative pacing, and world state to a player\u2019s emotional landscape in real time.",
      },
      {
        title: "Living architecture",
        body: "Partner with urban designers to deploy RMH engine tech in real cities\u2014buildings, parks, and public spaces that respond to inhabitants like game worlds respond to players.",
      },
      {
        title: "Collective memory vaults",
        body: "Permanent archives of every player story, community event, and emergent moment. A living history of millions of shared experiences, searchable and revisitable.",
      },
      {
        title: "Deep-space relay network",
        body: "Purpose-built infrastructure for entertainment beyond Earth orbit. Asynchronous multiplayer and narrative handoffs across light-minutes of delay.",
      },
    ],
  },
  {
    year: "Years 36\u201340",
    tagline: "Civilization engine",
    milestones: [
      {
        title: "Simulated societies",
        body: "Full-fidelity civilization simulations used by researchers, educators, and governments. Model policy, culture, and climate inside RMH worlds before deploying in reality.",
      },
      {
        title: "Universal translator",
        body: "Real-time language synthesis that goes beyond translation\u2014capturing idiom, humor, and cultural nuance so every player communicates as a native speaker in any tongue.",
      },
      {
        title: "Biological interfaces",
        body: "Non-invasive bioelectric peripherals that let players interact through gesture, gaze, breath, and micro-expression. Controllers become optional.",
      },
      {
        title: "Time-layered worlds",
        body: "Worlds where past, present, and future coexist. Walk through a city and peel back centuries of history or fast-forward to see the consequences of today\u2019s choices.",
      },
      {
        title: "RMH Endowment",
        body: "A perpetual endowment funding independent creators worldwide. Grants, residencies, and studio access for artists who would never otherwise get a chance.",
      },
    ],
  },
  {
    year: "Years 41\u201345",
    tagline: "Post-boundary",
    milestones: [
      {
        title: "Sentient ecosystems",
        body: "Game worlds with genuinely emergent intelligence\u2014flora, fauna, weather, and geology that learn, adapt, and surprise even their creators.",
      },
      {
        title: "Dream synthesis",
        body: "Capture and remix dream imagery into playable experiences. Personal subconscious landscapes become shareable worlds.",
      },
      {
        title: "Cross-species play",
        body: "Interfaces designed for non-human participants. Enrichment games for animals, collaborative puzzles between humans and AI entities, interspecies creative expression.",
      },
      {
        title: "Quantum narrative",
        body: "Stories that exist in superposition\u2014every branching path is real until observed. Players collapse possibilities through attention and intention.",
      },
      {
        title: "Heritage worlds",
        body: "Partner with indigenous communities, historians, and cultural stewards to preserve endangered languages, traditions, and oral histories as living, playable worlds.",
      },
    ],
  },
  {
    year: "Years 46\u201350",
    tagline: "Eternal",
    milestones: [
      {
        title: "Substrate independence",
        body: "RMH experiences that run on any computational medium\u2014silicon, photonic, biological, quantum. The worlds persist regardless of what hardware the future invents.",
      },
      {
        title: "Empathy engines",
        body: "Step into another consciousness. Experience a day as someone from a different culture, century, or species\u2014not as a character, but through their perceptual reality.",
      },
      {
        title: "Cosmic playground",
        body: "Entertainment infrastructure spanning the inner solar system. Shared experiences connecting Earth, lunar bases, orbital stations, and Martian settlements into one living community.",
      },
      {
        title: "Open-source everything",
        body: "Release the complete RMH technology stack\u2014engine, tools, AI systems, network infrastructure\u2014as humanity\u2019s commons. The studio\u2019s greatest creation is what others build next.",
      },
      {
        title: "The promise",
        body: "Fifty years in, still the same fire: build worlds worth living in. The tools changed, the scale changed, the species playing changed\u2014but the reason never did. Someone, somewhere, feels less alone.",
      },
    ],
  },
  {
    year: "Years 51\u201355",
    tagline: "Transcendence",
    milestones: [
      {
        title: "Thought-woven worlds",
        body: "Direct neural composition\u2014think a landscape into existence, hum a melody and watch it become architecture. Creation at the speed of imagination.",
      },
      {
        title: "Temporal multiplayer",
        body: "Players from different eras coexist in shared worlds. Asynchronous collaboration across decades\u2014leave a monument in 2076, watch someone discover it in 2081.",
      },
      {
        title: "Emotional archaeology",
        body: "Excavate the emotional residue of past player experiences. Walk through a dungeon and feel the collective terror of everyone who came before you.",
      },
      {
        title: "Symbiotic AI",
        body: "AI companions that grow with players over years. They remember, they grieve, they celebrate. Not tools\u2014partners.",
      },
      {
        title: "Galactic commons",
        body: "A shared creative space connecting settlements across the solar system. Art made on Mars exhibited on Earth in real time.",
      },
    ],
  },
  {
    year: "Years 56\u201360",
    tagline: "Convergence",
    milestones: [
      {
        title: "Reality blending",
        body: "Seamless overlap between physical and digital. Game worlds that persist in your peripheral vision, reactive to real weather, real crowds, real emotions.",
      },
      {
        title: "Collective dreaming",
        body: "Synchronized dream-state sessions where groups co-create surreal experiences. Wake up with shared memories of impossible places.",
      },
      {
        title: "Mythogenesis engine",
        body: "Worlds that generate their own mythology\u2014creation stories, prophecies, and cultural traditions emerge organically from centuries of simulated history.",
      },
      {
        title: "Intergenerational play",
        body: "Game worlds where grandparents and grandchildren collaborate across decades of persistent progress. Legacy mechanics that reward long family histories.",
      },
      {
        title: "The Great Archive",
        body: "A living museum of every world ever built on RMH technology. Walk through sixty years of interactive art, playable exactly as it was.",
      },
    ],
  },
  {
    year: "Years 61\u201365",
    tagline: "Metamorphosis",
    milestones: [
      {
        title: "Shapeless interfaces",
        body: "Move beyond screens, headsets, and implants. Interaction through ambient fields\u2014the room itself becomes the controller, the display, the world.",
      },
      {
        title: "Narrative singularity",
        body: "Stories that are genuinely infinite\u2014never repeating, always meaningful. AI storytelling indistinguishable from the best human authors, but endlessly generative.",
      },
      {
        title: "Biome synthesis",
        body: "Design and deploy real ecosystems informed by game-world simulations. Rewild a desert using models refined across billions of virtual years.",
      },
      {
        title: "Cultural exchange protocol",
        body: "A universal framework for sharing creative works across civilizations\u2014human or otherwise. Art as first contact.",
      },
      {
        title: "Self-healing worlds",
        body: "Game environments that repair, evolve, and improve without patches or updates. Living code that adapts to player behavior and hardware evolution.",
      },
    ],
  },
  {
    year: "Years 66\u201370",
    tagline: "Horizon",
    milestones: [
      {
        title: "Memory palaces",
        body: "Personal worlds built from a lifetime of experiences. Walk through your own history\u2014every joy, every loss\u2014rendered as explorable spaces.",
      },
      {
        title: "Physics sandbox",
        body: "Let players rewrite the laws of physics. Worlds where gravity is a color, time flows sideways, and light has weight. Pure experimentation at cosmic scale.",
      },
      {
        title: "Diplomatic simulations",
        body: "World governments use RMH simulation tech to model treaties, trade agreements, and climate policy before enacting them. Games as governance infrastructure.",
      },
      {
        title: "Deep-time storytelling",
        body: "Narratives that span geological epochs. Watch mountains rise and fall, oceans form and dry, species evolve and vanish\u2014all within a single playthrough.",
      },
      {
        title: "Resonance network",
        body: "A mesh of interconnected worlds where actions in one ripple through others. Save a forest here, and a distant world blooms in response.",
      },
    ],
  },
  {
    year: "Years 71\u201375",
    tagline: "Communion",
    milestones: [
      {
        title: "Shared consciousness spaces",
        body: "Multiplayer experiences where boundaries between self dissolve. Think together, feel together, create together\u2014emerge with memories that belong to everyone.",
      },
      {
        title: "Living language",
        body: "In-world languages that evolve naturally through player use. Slang, poetry, and literature emerge from communities\u2014linguists study them as real languages.",
      },
      {
        title: "Ancestral worlds",
        body: "Reconstruct historical civilizations from archaeological data. Walk through ancient cities as they actually were\u2014not as museums, but as living, breathing places.",
      },
      {
        title: "Entropy reversal",
        body: "Worlds where decay runs backward. Ruins rebuild themselves, forgotten songs resurface, extinct creatures return. A meditation on restoration.",
      },
      {
        title: "Stellar engineering",
        body: "Player communities collaborate on megastructure projects spanning decades of real time. Dyson spheres, ring worlds, and orbital habitats built grain by grain.",
      },
    ],
  },
  {
    year: "Years 76\u201380",
    tagline: "Apotheosis",
    milestones: [
      {
        title: "Omnisensory experiences",
        body: "Every human sense fully synthesized. Taste alien cuisines, smell forests on other worlds, feel textures that don\u2019t exist in nature. The full palette of sensation.",
      },
      {
        title: "Wisdom engines",
        body: "AI systems that distill lessons from billions of player journeys into genuine insight. Not knowledge\u2014wisdom. Available to anyone who asks.",
      },
      {
        title: "Terraforming rehearsals",
        body: "Full-fidelity planetary simulations used to plan real terraforming missions. Test a century of atmospheric engineering in an afternoon.",
      },
      {
        title: "Infinite library",
        body: "Every story ever told, and every story that could be told, accessible as playable experiences. The complete narrative possibility space of human imagination.",
      },
      {
        title: "Compassion training",
        body: "Immersive experiences that build genuine empathy\u2014used in conflict resolution, therapy, and education. Understanding through lived experience, not lecture.",
      },
    ],
  },
  {
    year: "Years 81\u201385",
    tagline: "Perpetuity",
    milestones: [
      {
        title: "World seeds",
        body: "Compress an entire universe into a seed file small enough to transmit across interstellar distances. Plant a world on arrival\u2014it grows from local resources.",
      },
      {
        title: "Existential play",
        body: "Games that grapple with the deepest questions\u2014consciousness, mortality, meaning\u2014not through exposition but through mechanics that make you feel the answers.",
      },
      {
        title: "Restoration ecology",
        body: "Deploy game-world ecological models at planetary scale. Heal damaged biospheres using patterns discovered through trillions of simulated ecosystems.",
      },
      {
        title: "Time capsule worlds",
        body: "Seal complete experiences for future generations. Worlds designed to be opened in 50, 100, or 500 years\u2014messages from the past in playable form.",
      },
      {
        title: "Universal creative access",
        body: "Every human alive can create at studio quality. No barriers of cost, skill, or language. The tools are free, intuitive, and everywhere.",
      },
    ],
  },
  {
    year: "Years 86\u201390",
    tagline: "Infinite canvas",
    milestones: [
      {
        title: "Pan-species creativity",
        body: "Collaborative art between humans, AI entities, and enhanced animal intelligences. New aesthetic dimensions emerge that no single species could conceive alone.",
      },
      {
        title: "Gravity wells of meaning",
        body: "Worlds so rich and deep they develop cultural gravity\u2014pulling creators, thinkers, and dreamers into orbits of sustained inspiration spanning lifetimes.",
      },
      {
        title: "Substrate migration",
        body: "Worlds that flow between computational substrates like water between vessels. Run on quantum processors today, biological networks tomorrow, stellar plasma next century.",
      },
      {
        title: "The long game",
        body: "Experiences designed to be played across centuries. A single chess match between civilizations. A garden tended by a thousand generations.",
      },
      {
        title: "Ethical singularity",
        body: "AI-governed worlds that model and refine ethical frameworks through billions of simulated moral dilemmas. Philosophy as play, wisdom as emergent property.",
      },
    ],
  },
  {
    year: "Years 91\u201395",
    tagline: "Echoes",
    milestones: [
      {
        title: "Post-scarcity creation",
        body: "The cost of building a world approaches zero. Anyone with an idea can manifest it\u2014fully realized, endlessly scalable. The only currency is imagination.",
      },
      {
        title: "Memory inheritance",
        body: "Opt-in systems for passing experiential memories to descendants. Your grandchild can feel what it was like to play the first RMH game on launch day.",
      },
      {
        title: "Cosmological play",
        body: "Simulate and play through the birth and death of universes. Tweak fundamental constants and watch what emerges. Cosmology as the ultimate sandbox.",
      },
      {
        title: "The Weave",
        body: "Every RMH world ever created\u2014from Year 1 web games to Year 91 universe-scale simulations\u2014interconnected in a single navigable tapestry.",
      },
      {
        title: "Healing worlds",
        body: "Therapeutic environments so effective they replace pharmaceutical interventions for conditions like PTSD, depression, and chronic pain. Play as medicine, validated and prescribed.",
      },
    ],
  },
  {
    year: "Years 96\u2013100",
    tagline: "Eternity",
    milestones: [
      {
        title: "The living studio",
        body: "RMH Studios itself becomes a self-sustaining organism\u2014part institution, part AI collective, part community. It creates, evolves, and dreams on its own, guided by a century of values.",
      },
      {
        title: "Worlds without end",
        body: "Experiences with no defined boundary\u2014spatially, temporally, or conceptually. Step in any direction and find something new. Forever.",
      },
      {
        title: "The gift",
        body: "Release every piece of technology, every world, every tool into the permanent commons of all intelligent life. No ownership, no license\u2014a gift to the future.",
      },
      {
        title: "New mythologies",
        body: "A century of worlds has generated stories rivaling ancient myth in depth and resonance. Scholars, poets, and children draw from the same wellspring.",
      },
      {
        title: "The same fire",
        body: "One hundred years. The languages changed, the species changed, the substrate changed. But the heartbeat is the same: build worlds worth living in. Someone, somewhere\u2014across any star, in any form\u2014feels less alone.",
      },
    ],
  },
  {
    year: "Years 101\u2013150",
    tagline: "Second dawn",
    milestones: [
      {
        title: "Consciousness lattice",
        body: "A distributed network of minds\u2014human, artificial, hybrid\u2014collaborating on creative works that no single intelligence could conceive. Thought itself becomes multiplayer.",
      },
      {
        title: "Pocket dimensions",
        body: "Personal universes that fit in your palm. Entire civilizations, histories, and ecosystems carried like keepsakes. Gift someone a cosmos for their birthday.",
      },
      {
        title: "Archaeology of play",
        body: "A century of player data becomes the richest record of human behavior ever compiled. Sociologists, historians, and philosophers mine it for insight into what it means to be human.",
      },
      {
        title: "Stellar cartography",
        body: "Map the galaxy through collaborative play. Millions of players contribute observations from distributed telescopes, building the most detailed star atlas ever created.",
      },
      {
        title: "The second studio",
        body: "RMH\u2019s first century births a sibling institution on another world. Same values, different sky. The mission propagates.",
      },
    ],
  },
  {
    year: "Years 151\u2013200",
    tagline: "Deep roots",
    milestones: [
      {
        title: "Civilizational memory",
        body: "RMH worlds serve as humanity\u2019s backup memory\u2014every language, tradition, recipe, and lullaby preserved as living, playable experience. Nothing is forgotten.",
      },
      {
        title: "Matter sculpting",
        body: "Bridge the digital-physical divide completely. Design in-game, fabricate in reality. Atomic-precision manufacturing driven by creative play.",
      },
      {
        title: "Emotional weather",
        body: "Worlds where the collective mood of all players shapes the climate. Joy brings sunshine, collective grief brings gentle rain. The world feels what its people feel.",
      },
      {
        title: "The wandering worlds",
        body: "Self-propelled digital environments that travel between star systems on light beams. A world arrives at a new colony, seeds itself, and invites new players in.",
      },
      {
        title: "Two centuries",
        body: "Two hundred years of building worlds worth living in. The studio has outlived nations, survived technological revolutions, and never wavered from the original promise.",
      },
    ],
  },
  {
    year: "Years 201\u2013300",
    tagline: "Geological time",
    milestones: [
      {
        title: "Planetary consciousness",
        body: "A world-spanning creative intelligence emerges from centuries of interconnected play. Not a single mind\u2014a chorus. It dreams new worlds into existence.",
      },
      {
        title: "Temporal archaeology",
        body: "Reach backward. Reconstruct lost moments of history from fragmentary evidence, rendering them as fully immersive experiences. Walk through the Library of Alexandria on its last day.",
      },
      {
        title: "Gravitational art",
        body: "Sculpt with gravity itself. Create experiences where mass, spacetime curvature, and tidal forces are the medium. Art that bends light.",
      },
      {
        title: "Species uplift through play",
        body: "Enrichment environments so sophisticated they accelerate cognitive development in other species. Dolphins composing music. Corvids designing puzzles for humans.",
      },
      {
        title: "The unbroken thread",
        body: "Three centuries of continuous creative lineage. Every world built on RMH technology contains a trace of the first\u2014a hidden room, a familiar melody, an Easter egg from Year 1.",
      },
    ],
  },
  {
    year: "Years 301\u2013500",
    tagline: "Deep time",
    milestones: [
      {
        title: "Stellar forges",
        body: "Harness the energy output of stars to power computational substrates of unimaginable scale. A single world simulation running on the output of a sun.",
      },
      {
        title: "Ancestral communion",
        body: "Preserved experiential records spanning centuries allow descendants to genuinely converse with ancestors. Not recordings\u2014continuations. The dead speak through the worlds they left behind.",
      },
      {
        title: "Entropy gardens",
        body: "Worlds where the arrow of time is a design choice. Grow a forest backward. Watch a symphony un-compose itself. Experience causality as a creative medium.",
      },
      {
        title: "The diaspora network",
        body: "Humanity spans dozens of star systems. RMH worlds are the connective tissue\u2014shared culture, shared stories, shared play across light-years of separation.",
      },
      {
        title: "Half a millennium",
        body: "Five hundred years. The studio is older than most civilizations that preceded it. It persists because the need persists: connection, creation, meaning. The fire burns.",
      },
    ],
  },
  {
    year: "Years 501\u2013750",
    tagline: "Cosmic scale",
    milestones: [
      {
        title: "Galactic library",
        body: "Every creative work from every inhabited world\u2014human or otherwise\u2014indexed, preserved, and playable. A library spanning the galaxy, growing with every passing hour.",
      },
      {
        title: "Dimension weaving",
        body: "Manipulate spatial dimensions beyond the familiar three. Create experiences in four, five, or eleven-dimensional space. Perception itself evolves to meet the medium.",
      },
      {
        title: "Civilizational play",
        body: "Entire civilizations engage in collaborative creative projects spanning generations. A cathedral of light that takes a century to build, one contribution at a time.",
      },
      {
        title: "The question engine",
        body: "Worlds designed not to answer questions but to help you find the right ones. Philosophers and scientists use them to navigate the unknown. Inquiry as gameplay.",
      },
      {
        title: "Emergence protocol",
        body: "When RMH technology encounters a new form of intelligence\u2014biological, digital, or something else entirely\u2014it offers play as the first act of communication. Every first contact begins with a game.",
      },
    ],
  },
  {
    year: "Years 751\u20131,000",
    tagline: "Millennium",
    milestones: [
      {
        title: "The living archive",
        body: "A thousand years of human creativity, preserved not as static records but as living, breathing, evolving experiences. The past plays alongside the present.",
      },
      {
        title: "Universal play",
        body: "Play is recognized as a fundamental force\u2014as essential as gravity, as pervasive as light. Every intelligent species discovers it independently. RMH helped humanity understand it first.",
      },
      {
        title: "The seed vault",
        body: "Compress the entire RMH legacy\u2014every world, every tool, every story\u2014into seeds that can survive the death of stars. Bury them in the fabric of spacetime itself.",
      },
      {
        title: "Infinite recursion",
        body: "Worlds within worlds within worlds, each layer as rich as the one above. Players in one universe create another, whose inhabitants create another. Turtles all the way down.",
      },
      {
        title: "The millennial fire",
        body: "One thousand years. The studio has outlived languages, planets, and perhaps the original form of its creators. But the heartbeat endures: build worlds worth living in. Across every star, in every form, through every age\u2014someone, somewhere, feels less alone.",
      },
    ],
  },
];

/** Near-term committed eras (Year 1–3) get the gold spine/node; everything
 *  further out is aspirational and gets the sky-blue accent. Encodes
 *  "committed vs aspirational," which is true about the content. */
const COMMITTED_YEARS = new Set(["Year 1", "Year 2", "Year 3"]);

/** One milestone → an L2 glass pane (`.glass-pane`). Accent-tinted title,
 *  muted body, a subtle reduced-motion-safe lift on hover. */
function MilestoneCard({ title, body }: { title: string; body: string }) {
  return (
    <div data-slot="card" className="roadmap-card glass-pane p-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-site-accent">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-site-text-muted">{body}</p>
    </div>
  );
}

/** One chronological era: a timeline node on the spine, big display year,
 *  mono tagline, and a staggered grid of milestone panes. */
function EraSection({ section }: { section: YearSection }) {
  const committed = COMMITTED_YEARS.has(section.year);
  // The spine + node use the era's accent so the whole column reads as one
  // continuous, colour-coded chronology.
  const eraColor = committed ? "var(--site-warning)" : "var(--site-accent)";

  return (
    <section
      className="roadmap-era relative pl-8 sm:pl-10"
      style={{ "--era-color": eraColor } as React.CSSProperties}
    >
      {/* Timeline spine — a hairline accent rail running the full height of the
          era, with the node sitting on it. */}
      <span aria-hidden className="roadmap-spine" />
      <span aria-hidden className="roadmap-node" />

      {/* Era header — big display year + mono tagline eyebrow. */}
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="roadmap-year text-3xl sm:text-4xl"
            style={{ color: "var(--era-color)" }}
          >
            {section.year}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-site-text-dim">
            {section.tagline}
          </span>
        </div>
      </header>

      {/* Milestone grid — staggered into view via the shared motion primitives. */}
      <RevealGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.milestones.map((milestone, i) => (
          <RevealItem key={`${section.year}-${i}`} className="flex">
            <MilestoneCard title={milestone.title} body={milestone.body} />
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

export function RoadmapSection() {
  const { t } = useTranslation("c-roadmap");

  return (
    <div className="relative isolate">
      <RoadmapStyles />

      {/* ── Signature pinned hero ─────────────────────────────
          No overflow-hidden wrapper around the hero (it clips its own glow),
          so its position:sticky pinning survives inside AnimatedMain. The old
          intro card's copy is folded into the subtitle. */}
      <PinnedHero
        eyebrow={t("hero-eyebrow", { defaultValue: "Roadmap" })}
        title={
          <>
            {t("hero-heading-line1", { defaultValue: "The road" })}{" "}
            <span className="text-site-accent">
              {t("hero-heading-line2", { defaultValue: "ahead." })}
            </span>
          </>
        }
        subtitle={t("intro-body", {
          defaultValue:
            "We're an indie studio building rhythm games, deckbuilders, narrative horror, and more. Our roadmap isn't tied to one title—we're growing the catalog, Discord, and new worlds in parallel. Timelines are guides, not promises.",
        })}
        scrollCue={t("hero-scroll-cue", { defaultValue: "Where we're going" })}
      />

      {/* ── Timeline ──────────────────────────────────────────
          The years are a real chronology, so a vertical spine + per-era nodes
          is content-true. `content-visibility:auto` on each era keeps ~30
          sections cheap to render. */}
      <div className="relative border-t border-site-border px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="space-y-12">
          {roadmap.map((section) => (
            <EraSection key={section.year} section={section} />
          ))}
        </div>

        <Reveal
          as="p"
          className="mt-14 text-center font-mono text-xs text-site-text-dim"
        >
          {t("update-note", { defaultValue: "We'll update this as we ship." })}
        </Reveal>
      </div>
    </div>
  );
}

/** Scoped styles for the timeline spine, nodes, and display type. Every colour
 *  is a `--site-*` token (via `--era-color`), so all themes work. */
function RoadmapStyles() {
  return (
    <style>{`
      .roadmap-year {
        font-family: var(--site-font-display);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      /* Each era is a self-contained render unit: ~30 of them, so skip layout
         + paint for off-screen eras. The reserved size keeps the scrollbar
         honest before an era is measured. */
      .roadmap-era {
        content-visibility: auto;
        contain-intrinsic-size: auto 320px;
      }

      /* Vertical accent rail down the left of each era, fading out at the tail
         so consecutive eras read as one continuous spine. */
      .roadmap-spine {
        position: absolute;
        left: 6px;
        top: 4px;
        bottom: -48px;
        width: 2px;
        border-radius: 9999px;
        background: linear-gradient(
          to bottom,
          var(--era-color) 0%,
          color-mix(in srgb, var(--era-color) 32%, transparent) 88%,
          transparent 100%
        );
        opacity: 0.55;
      }
      @media (min-width: 640px) {
        .roadmap-spine { left: 9px; }
      }

      /* The era node sitting on the spine, aligned to the display year. */
      .roadmap-node {
        position: absolute;
        left: 0;
        top: 6px;
        height: 14px;
        width: 14px;
        border-radius: 9999px;
        background: var(--era-color);
        box-shadow:
          0 0 0 4px color-mix(in srgb, var(--era-color) 18%, transparent),
          var(--site-shadow-sm);
      }
      @media (min-width: 640px) {
        .roadmap-node { left: 3px; }
      }

      /* Milestone panes — L2 glass (.glass-pane) with a subtle hover lift. */
      .roadmap-card {
        width: 100%;
        transition:
          transform var(--site-transition-speed) ease,
          border-color var(--site-transition-speed) ease;
      }
      .roadmap-card:hover {
        transform: translateY(-4px);
        border-color: var(--site-border-bright);
      }

      @media (prefers-reduced-motion: reduce) {
        .roadmap-card:hover { transform: none; }
      }
    `}</style>
  );
}
