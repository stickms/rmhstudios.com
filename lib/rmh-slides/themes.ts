import type { SlideTheme } from '@/components/rmh-slides/types';

export const slideThemes: SlideTheme[] = [
  {
    name: 'Default Dark',
    colors: { bg: '#1a1a2e', text: '#e0e0e0', accent: '#f97316', surface: '#16213e' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Light Professional',
    colors: { bg: '#ffffff', text: '#1a1a1a', accent: '#2563eb', surface: '#f5f5f5' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Ocean Blue',
    colors: { bg: '#0c1e3a', text: '#e0eaf6', accent: '#38bdf8', surface: '#152a4a' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Forest Green',
    colors: { bg: '#0a1f0a', text: '#d4e8d4', accent: '#4ade80', surface: '#142814' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Sunset Warm',
    colors: { bg: '#1f0d0a', text: '#f5e0d0', accent: '#fb923c', surface: '#2a1510' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Midnight Purple',
    colors: { bg: '#1a0a2e', text: '#e0d0f0', accent: '#a78bfa', surface: '#231040' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Slate Modern',
    colors: { bg: '#0f172a', text: '#e2e8f0', accent: '#06b6d4', surface: '#1e293b' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Rose Elegant',
    colors: { bg: '#1a0a14', text: '#f0d0e0', accent: '#f472b6', surface: '#2a1020' },
    fontFamily: 'Inter, sans-serif',
  },
  {
    name: 'Cream Classic',
    colors: { bg: '#fef9ef', text: '#2c1f0f', accent: '#b45309', surface: '#fdf2e0' },
    fontFamily: 'Georgia, serif',
  },
  {
    name: 'Neon Cyber',
    colors: { bg: '#0a0a0a', text: '#e0ffe0', accent: '#22d3ee', surface: '#141414' },
    fontFamily: 'Inter, sans-serif',
  },
];

export function getThemeByName(name: string): SlideTheme | undefined {
  return slideThemes.find((t) => t.name === name);
}
