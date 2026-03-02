# RMH Studios — UI Redesign

## Vision

Transform the main website from a heavy cyberpunk/hyperpop aesthetic to a **clean, minimalistic, modern** design inspired by the rmhbox and rmhtube design systems. The result should feel like a refined game studio — confident, polished, and fast.

## Design Principles

1. **Less is more** — Remove visual noise. Let content breathe.
2. **Consistent surfaces** — Dark layered surfaces with subtle borders, matching rmhbox/rmhtube.
3. **Single accent color** — Warm Violet (#9b7ad8) as brand identity, bridging rmhbox blue and rmhtube red.
4. **Performance first** — No canvas particles, no per-letter physics, no global mouse tracking.
5. **Smooth & subtle** — Framer Motion fade-ins and soft hovers instead of glitch/neon/rainbow effects.

## Color System

### Dark Theme (Default)
| Token | Value | Usage |
|-------|-------|-------|
| `--site-bg` | `#1a1b1e` | Page background |
| `--site-bg-subtle` | `#202124` | Alternating section backgrounds |
| `--site-surface` | `#27282c` | Cards, panels |
| `--site-surface-hover` | `#313238` | Hovered cards |
| `--site-border` | `#3a3b42` | Borders, dividers |
| `--site-text` | `#e8e8ec` | Primary text |
| `--site-text-muted` | `#9a9ba4` | Secondary text |
| `--site-text-dim` | `#6a6b74` | Tertiary text, labels |
| `--site-accent` | `#9b7ad8` | CTAs, links, active states |
| `--site-accent-hover` | `#8a68c9` | Hovered accent elements |
| `--site-accent-dim` | `rgba(155, 122, 216, 0.12)` | Accent backgrounds |

### Light Theme
| Token | Value | Usage |
|-------|-------|-------|
| `--site-bg` | `#f5f5f7` | Page background |
| `--site-surface` | `#ffffff` | Cards, panels |
| `--site-border` | `#d4d4da` | Borders |
| `--site-text` | `#2a2b30` | Primary text |
| `--site-text-muted` | `#6a6b74` | Secondary text |
| `--site-accent` | `#7c5cb8` | CTAs, links |

## Typography

| Role | Font | Weight |
|------|------|--------|
| Display/Headings | Nunito | Bold (700), Black (900) |
| Body | Inter | Regular (400), Medium (500) |
| Code/Mono | JetBrains Mono | Regular (400) |

## Homepage Sections

### Hero
- Clean centered layout, no particles/scanlines/grid/orbs
- Large Nunito heading "RMH STUDIOS" with subtle accent gradient on "STUDIOS"
- Tagline in Inter, muted text
- Single accent CTA button "Explore Our Games"
- Soft radial accent gradient blob behind heading (CSS only)
- Staggered fade-up entrance animation

### Our Games / Our Apps
- Clean section headings with SectionHeading component
- Existing Embla carousel restyled with site tokens
- Alternating section backgrounds (`--site-bg` / `--site-bg-subtle`)
- No neon gradients

### About
- Clean centered text, stats grid
- Numbers bold in `--site-text`, labels in `--site-text-dim`
- No floating elements or orbs

### Testimonials
- SurfaceCard grid (no 3D bounce)
- Stars and author names in `--site-accent`
- Staggered entrance animation

### Blog
- Clean blog cards with surface bg and border
- Hover: border shifts to accent, subtle shadow lift
- No grid overlays

### Merch
- SurfaceCard product cards
- Price in `--site-accent`

### Footer
- Standard height (not full-screen)
- Grid layout: Logo | Nav | Social icons | Contact
- Social icons: dim → accent on hover, subtle scale
- Top border divider, no neon gradients

## Navbar
- Glass background: `rgba(26, 27, 30, 0.85)` + blur + border
- Logo: Nunito bold, "STUDIOS" in accent color
- Links: Inter, normal case, muted → white on hover, accent when active
- Theme toggle (sun/moon icon)
- Clean accent button for sign-in

## What Gets Removed
- ParticleField (canvas)
- FloatingShapes, FloatingElement (mouse tracking)
- PulsatingOrb (animated orbs)
- GlitchText, ProximityText (text effects)
- NeonButton (rainbow chromatic button)
- BouncyCard (3D tilt card)
- GlobalSmartScroll (complex scroll nav)
- MouseContext (global mouse tracking)
- usePerformanceMode (no longer needed)
- All neon CSS animations (rainbow, glitch, scanlines, grid, noise, etc.)

## What Stays
- Framer Motion `whileInView` scroll animations (subtle fade-ins)
- Embla carousel mechanics (restyled)
- Shadcn/Radix UI primitives
- All game/app-specific pages and their isolated themes
- `prefers-reduced-motion` accessibility support
