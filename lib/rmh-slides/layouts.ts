import type { SlideElement } from '@/components/rmh-slides/types';

function makeId(): string {
  return 'el_' + Math.random().toString(36).substring(2, 11);
}

export type LayoutName = 'blank' | 'title' | 'title-content' | 'two-column' | 'section-header' | 'image-text';

export interface LayoutDefinition {
  name: LayoutName;
  label: string;
  description: string;
  create: () => SlideElement[];
}

const blankLayout: LayoutDefinition = {
  name: 'blank',
  label: 'Blank',
  description: 'Empty slide',
  create: () => [],
};

const titleLayout: LayoutDefinition = {
  name: 'title',
  label: 'Title Slide',
  description: 'Large centered title',
  create: () => [
    {
      id: makeId(),
      type: 'text',
      x: 10,
      y: 30,
      width: 80,
      height: 20,
      rotation: 0,
      content: '<h1 style="text-align: center">Presentation Title</h1>',
      zIndex: 1,
      style: { fontSize: 48, textAlign: 'center', color: '#ffffff' },
    },
    {
      id: makeId(),
      type: 'text',
      x: 20,
      y: 55,
      width: 60,
      height: 10,
      rotation: 0,
      content: '<p style="text-align: center">Subtitle goes here</p>',
      zIndex: 2,
      style: { fontSize: 24, textAlign: 'center', color: '#a0a0a0' },
    },
  ],
};

const titleContentLayout: LayoutDefinition = {
  name: 'title-content',
  label: 'Title + Content',
  description: 'Title at top, content below',
  create: () => [
    {
      id: makeId(),
      type: 'text',
      x: 5,
      y: 5,
      width: 90,
      height: 12,
      rotation: 0,
      content: '<h2>Slide Title</h2>',
      zIndex: 1,
      style: { fontSize: 36, color: '#ffffff' },
    },
    {
      id: makeId(),
      type: 'text',
      x: 5,
      y: 22,
      width: 90,
      height: 70,
      rotation: 0,
      content: '<p>Click to add content</p>',
      zIndex: 2,
      style: { fontSize: 20, color: '#d0d0d0' },
    },
  ],
};

const twoColumnLayout: LayoutDefinition = {
  name: 'two-column',
  label: 'Two Column',
  description: 'Title with two text columns',
  create: () => [
    {
      id: makeId(),
      type: 'text',
      x: 5,
      y: 5,
      width: 90,
      height: 12,
      rotation: 0,
      content: '<h2>Slide Title</h2>',
      zIndex: 1,
      style: { fontSize: 36, color: '#ffffff' },
    },
    {
      id: makeId(),
      type: 'text',
      x: 5,
      y: 22,
      width: 42,
      height: 70,
      rotation: 0,
      content: '<p>Left column content</p>',
      zIndex: 2,
      style: { fontSize: 18, color: '#d0d0d0' },
    },
    {
      id: makeId(),
      type: 'text',
      x: 53,
      y: 22,
      width: 42,
      height: 70,
      rotation: 0,
      content: '<p>Right column content</p>',
      zIndex: 3,
      style: { fontSize: 18, color: '#d0d0d0' },
    },
  ],
};

const sectionHeaderLayout: LayoutDefinition = {
  name: 'section-header',
  label: 'Section Header',
  description: 'Large centered section title',
  create: () => [
    {
      id: makeId(),
      type: 'text',
      x: 10,
      y: 35,
      width: 80,
      height: 20,
      rotation: 0,
      content: '<h1 style="text-align: center">Section Title</h1>',
      zIndex: 1,
      style: { fontSize: 52, textAlign: 'center', color: '#ffffff' },
    },
  ],
};

const imageTextLayout: LayoutDefinition = {
  name: 'image-text',
  label: 'Image + Text',
  description: 'Image on left, text on right',
  create: () => [
    {
      id: makeId(),
      type: 'image',
      x: 3,
      y: 5,
      width: 45,
      height: 90,
      rotation: 0,
      content: '',
      zIndex: 1,
      style: { objectFit: 'cover', borderRadius: 8 },
    },
    {
      id: makeId(),
      type: 'text',
      x: 53,
      y: 5,
      width: 42,
      height: 12,
      rotation: 0,
      content: '<h2>Title</h2>',
      zIndex: 2,
      style: { fontSize: 32, color: '#ffffff' },
    },
    {
      id: makeId(),
      type: 'text',
      x: 53,
      y: 22,
      width: 42,
      height: 70,
      rotation: 0,
      content: '<p>Description text goes here</p>',
      zIndex: 3,
      style: { fontSize: 18, color: '#d0d0d0' },
    },
  ],
};

export const layouts: LayoutDefinition[] = [
  blankLayout,
  titleLayout,
  titleContentLayout,
  twoColumnLayout,
  sectionHeaderLayout,
  imageTextLayout,
];

export function getLayout(name: LayoutName): LayoutDefinition {
  return layouts.find((l) => l.name === name) || blankLayout;
}
