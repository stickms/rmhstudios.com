# rmhstudios.com

**Digital Portfolio & Studio Website**

rmhstudios.com is a modern, high-performance web application designed to showcase a digital portfolio, blog (devlog), and studio projects. Built with the latest web technologies, it features a dynamic, animated user interface with a premium aesthetic.

## 🚀 Features

-   **Modern UI/UX**: Built with **Tailwind CSS v4** and **Framer Motion** for smooth, complex animations and transitions.
-   **Interactive Components**:
    -   **Hero Section**: Engaging entry point with proximity-aware text effects.
    -   **Carousel System**: Powered by `embla-carousel-react` for browsing blog posts and projects.
    -   **Blog / Devlog**: MDX-powered blog system allowing rich content authoring with Markdown.
    -   **Glitch & Neon Effects**: Custom UI components like `GlitchText`, `NeonButton`, and `ProximityText`.
-   **Responsive Design**: Fully responsive layouts optimized for mobile, tablet, and desktop.
-   **Performance**: Server-Side Rendering (SSR) and Static Site Generation (SSG) via Next.js 16.

## 🛠 Tech Stack

-   **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
-   **Animations**: [Framer Motion](https://www.framer.com/motion/)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **Content Management**: MDX (`next-mdx-remote`, `gray-matter`)
-   **Carousel**: [Embla Carousel](https://www.embla-carousel.com/)
-   **Deployment**: Vercel

## 📂 Project Structure

```bash
├── app/                  # Next.js App Router pages and layouts
│   ├── blog/             # Blog post details and listing pages
│   ├── globals.css       # Global styles and Tailwind directives
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Homepage composition
├── components/           # React components
│   ├── blog/             # Blog-specific components (lists, preview, etc.)
│   ├── homepage/         # Sections for the homepage (Hero, About, Projects, etc.)
│   └── ui/               # Reusable UI primitives (buttons, text effects, cards)
├── content/              # Markdown/MDX content files
│   └── blog/             # Blog posts source files
├── contexts/             # React Context definitions
├── hooks/                # Custom React hooks (e.g., useIsMobile)
├── lib/                  # Utility functions and shared logic (e.g., blog data fetching)
└── public/               # Static assets (images, fonts, icons)
```

## ⚡ Getting Started

### Prerequisites

-   **Node.js**: v18 or higher recommended.
-   **Package Manager**: `pnpm` (recommended), `npm`, or `yarn`.

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/rmhstudios.com.git
    cd rmhstudios.com
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    # or
    npm install
    ```

3.  Run the development server:
    ```bash
    pnpm dev
    # or
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Build & Deployment

To create a production build:

```bash
pnpm build
# or
npm run build
```

This project is optimized for deployment on **Vercel**.
1.  Push your code to a Git repository (GitHub, GitLab, Bitbucket).
2.  Import the project into Vercel.
3.  Vercel will automatically detect the Next.js configuration and deploy.

## 📝 Content Management (Blog)

Blog posts are stored in `content/blog` as `.mdx` files.
Each file follows this frontmatter format:

```markdown
---
title: "Your Post Title"
date: "2024-03-20"
description: "A brief summary of the post."
image: "/images/blog/your-image.jpg"
tags: ["Next.js", "Design"]
---

Your content goes here...
```

The application automatically reads and renders these files using `lib/blog.ts`.
