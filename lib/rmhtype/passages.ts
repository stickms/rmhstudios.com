/**
 * The curated RMHType passages: the one list the multiplayer and solo hub
 * (`server/socket-server/handlers/rmhtype.ts`) and the daily challenge draw from.
 * Pure data, client-safe; the scoring text is whatever is here.
 */

export interface Passage {
  id: string;
  text: string;
  difficulty:
    | 'easy'
    | 'medium'
    | 'hard';
  wordCount: number;
}

export const PASSAGES: readonly Passage[] =
  [
    // Easy passages
    {
      id: 'easy-01',
      text: 'The quick brown fox jumps over the lazy dog near the river bank on a warm summer day.',
      difficulty:
        'easy',
      wordCount: 17,
    },
    {
      id: 'easy-02',
      text: 'She sells seashells by the seashore while the sun sets behind the old lighthouse.',
      difficulty:
        'easy',
      wordCount: 14,
    },
    {
      id: 'easy-03',
      text: 'A gentle breeze swept through the garden carrying the sweet scent of fresh flowers.',
      difficulty:
        'easy',
      wordCount: 14,
    },
    {
      id: 'easy-04',
      text: 'The old man sat on the wooden bench watching the children play in the park.',
      difficulty:
        'easy',
      wordCount: 14,
    },
    {
      id: 'easy-05',
      text: 'Rain began to fall softly on the quiet street as the evening lights turned on.',
      difficulty:
        'easy',
      wordCount: 15,
    },
    {
      id: 'easy-06',
      text: 'The little cat jumped from the table to the chair and then onto the warm rug.',
      difficulty:
        'easy',
      wordCount: 16,
    },
    {
      id: 'easy-07',
      text: 'Every morning the baker would open his shop before the rest of the town woke up.',
      difficulty:
        'easy',
      wordCount: 16,
    },
    {
      id: 'easy-08',
      text: 'The train moved slowly through the countryside past green fields and small villages.',
      difficulty:
        'easy',
      wordCount: 13,
    },
    {
      id: 'easy-09',
      text: 'Birds sang their morning songs high up in the tall oak tree beside the house.',
      difficulty:
        'easy',
      wordCount: 15,
    },
    {
      id: 'easy-10',
      text: 'The dog ran across the yard chasing a bright red ball thrown by the young girl.',
      difficulty:
        'easy',
      wordCount: 16,
    },

    // Medium passages
    {
      id: 'med-01',
      text: 'Technology continues to reshape how we communicate and interact with the world around us. From smartphones to artificial intelligence, each innovation brings both opportunities and challenges that society must carefully navigate.',
      difficulty:
        'medium',
      wordCount: 33,
    },
    {
      id: 'med-02',
      text: 'The ancient library held thousands of manuscripts dating back centuries. Scholars from distant lands would travel for weeks just to spend a few precious hours studying the fragile pages within its stone walls.',
      difficulty:
        'medium',
      wordCount: 34,
    },
    {
      id: 'med-03',
      text: 'Programming requires a unique combination of logical thinking and creative problem solving. The best developers understand that elegant code is not just functional but readable and maintainable by others who come after them.',
      difficulty:
        'medium',
      wordCount: 34,
    },
    {
      id: 'med-04',
      text: 'The ocean stretched endlessly before the small fishing boat. Captain Torres checked his compass and adjusted the sails, knowing that the weather could change without warning this far from shore.',
      difficulty:
        'medium',
      wordCount: 31,
    },
    {
      id: 'med-05',
      text: 'In the heart of the bustling city, a small garden provided a peaceful refuge. Office workers would escape there during lunch breaks, finding solace among the carefully tended roses and quiet fountains.',
      difficulty:
        'medium',
      wordCount: 33,
    },
    {
      id: 'med-06',
      text: 'Music has the remarkable ability to evoke powerful emotions and transport us to different times and places. A single melody can bring back vivid memories that we thought were long forgotten.',
      difficulty:
        'medium',
      wordCount: 32,
    },
    {
      id: 'med-07',
      text: 'The scientific method requires careful observation, hypothesis formation, and rigorous testing. Each experiment builds upon the work of those who came before, gradually expanding our understanding of the natural world.',
      difficulty:
        'medium',
      wordCount: 31,
    },
    {
      id: 'med-08',
      text: 'Cooking is both an art and a science. The precise measurements matter just as much as the creative intuition that guides a chef to combine unexpected flavors into something truly extraordinary.',
      difficulty:
        'medium',
      wordCount: 31,
    },
    {
      id: 'med-09',
      text: 'The mountain trail wound through dense forest before emerging above the tree line. From there the hikers could see the entire valley spread out below them bathed in golden afternoon sunlight.',
      difficulty:
        'medium',
      wordCount: 32,
    },
    {
      id: 'med-10',
      text: 'Writing well demands practice and patience. Every great author has spent countless hours revising their work, searching for the perfect word or phrase that captures exactly what they want to express.',
      difficulty:
        'medium',
      wordCount: 32,
    },

    // Hard passages
    {
      id: 'hard-01',
      text: "The epistemological foundations of modern quantum mechanics challenge our classical intuitions about determinism and causality. Heisenberg's uncertainty principle demonstrates that the very act of measurement fundamentally alters the system being observed, rendering complete knowledge theoretically impossible.",
      difficulty:
        'hard',
      wordCount: 38,
    },
    {
      id: 'hard-02',
      text: 'Throughout the annals of jurisprudence, the tension between individual liberty and collective security has produced some of the most consequential philosophical debates. Constitutional scholars continue to grapple with the boundaries of governmental authority in an increasingly interconnected digital landscape.',
      difficulty:
        'hard',
      wordCount: 40,
    },
    {
      id: 'hard-03',
      text: "The architectural magnificence of Gothic cathedrals exemplifies medieval engineering's ambitious pursuit of verticality and luminosity. Flying buttresses, ribbed vaults, and pointed arches distributed tremendous structural forces, enabling the construction of unprecedented expanses of stained glass that transformed interior spaces into kaleidoscopes of colored light.",
      difficulty:
        'hard',
      wordCount: 42,
    },
    {
      id: 'hard-04',
      text: "Neuroplasticity research has revolutionized our understanding of the human brain's remarkable capacity for reorganization. Contrary to previously held beliefs about fixed neural pathways, contemporary neuroscience demonstrates that synaptic connections continuously adapt in response to experience, learning, and environmental stimuli throughout the entire lifespan.",
      difficulty:
        'hard',
      wordCount: 42,
    },
    {
      id: 'hard-05',
      text: 'The philosophical implications of artificial general intelligence extend far beyond technological considerations into fundamental questions about consciousness, moral agency, and the nature of understanding itself. If a sufficiently complex computational system exhibits behaviors indistinguishable from human cognition, the traditional Cartesian framework for defining sentience becomes increasingly inadequate.',
      difficulty:
        'hard',
      wordCount: 48,
    },
    {
      id: 'hard-06',
      text: 'Macroeconomic policy operates within a complex web of interdependent variables where interventions frequently produce counterintuitive results. The relationship between monetary supply, inflation expectations, and aggregate demand defies simplistic modeling, requiring policymakers to constantly recalibrate their approaches based on emerging empirical data.',
      difficulty:
        'hard',
      wordCount: 39,
    },
    {
      id: 'hard-07',
      text: 'The biodiversity of tropical rainforest ecosystems represents an intricate tapestry of symbiotic relationships developed over millions of years of coevolution. Each species occupies a precisely defined ecological niche; the removal of even a single organism can trigger cascading effects throughout the entire food web.',
      difficulty:
        'hard',
      wordCount: 43,
    },
    {
      id: 'hard-08',
      text: 'Cryptographic protocols underpinning modern digital security rely on the computational intractability of certain mathematical problems, particularly integer factorization and discrete logarithms. The advent of practical quantum computing threatens to fundamentally undermine these foundations, necessitating the urgent development of post-quantum cryptographic standards.',
      difficulty:
        'hard',
      wordCount: 39,
    },
    {
      id: 'hard-09',
      text: "The phenomenological tradition in continental philosophy, inaugurated by Edmund Husserl and subsequently developed by Heidegger and Merleau-Ponty, seeks to describe the structures of conscious experience as they present themselves to awareness, bracketing all presuppositions about the external world's independent existence.",
      difficulty:
        'hard',
      wordCount: 40,
    },
    {
      id: 'hard-10',
      text: 'Sustainable urban planning requires the integration of transportation infrastructure, green space allocation, energy-efficient building design, and equitable housing policy into a cohesive framework that anticipates demographic shifts while preserving the cultural heritage and unique character of existing neighborhoods.',
      difficulty:
        'hard',
      wordCount: 39,
    },
  ];
