import type { AppInfo } from '@/lib/catalog/types';

const entry: AppInfo =
  {
    id: 'rmhcharacters',
    order: 135,
    title:
      'RMHCharacters',
    description:
      'Build and run D&D 5e and Pathfinder 2e characters, with a rules advisor.',
    longDescription:
      'RMHCharacters is a character creator and sheet for Dungeons & Dragons Fifth Edition (the 2024 rules) and Pathfinder Second Edition (Remaster). It computes every number from the rules, walks you through species or ancestry, background, class, abilities, feats and spells, tracks hit points, slots and conditions at the table, and levels you up with a preview of what each level grants. Ask the advisor what to take next. Characters import from and export to Foundry VTT, Pathbuilder 2e, D&D Beyond and Markdown, and print as a PDF sheet.',
    href: '/rmhcharacters',
    status:
      'Beta',
    cta: 'Open Characters',
    isSteam: false,
    gradient:
      'from-red-800 via-amber-700 to-stone-600',
    iconName:
      'ScrollText',
    color:
      'from-red-800/20 to-stone-600/20 hover:border-red-800/50',
    tags: [
      'Tabletop',
      'D&D',
      'Pathfinder',
      'AI',
      'Beta',
    ],
    imagePath:
      '/images/games/rmhcharacters.webp',
    bannerPath:
      '/images/games/banners/rmhcharacters.webp',
    logoPath:
      '/images/games/logos/rmhcharacters.webp',
    authGate: true,
  };

export default entry;
