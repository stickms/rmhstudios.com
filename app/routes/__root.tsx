/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { TwemojiProvider } from "@/components/ui/TwemojiProvider";
import appCss from "@/app/globals.css?url";

/**
 * Inline script that applies the persisted theme class to <html> before
 * React hydrates, preventing a flash-of-unstyled-content (FOUC).
 */
const themeScript = `(function(){try{var m={default:"#1a1b1e",light:"#f5f5f7",gamer:"#0a0a0a",anime:"#fff5f9",musical:"#0c0e1a",hyperpop:"#120018","comic-book":"#fffde0",cinema:"#0a0a08","gen-z":"#1a1820",boomer:"#f5f0e8",aries:"#1a0a0a",taurus:"#141a10",gemini:"#0e0e22",cancer:"#0c1018",leo:"#140e1e",virgo:"#f4f6f2",libra:"#f8f0f6",scorpio:"#0e0608",sagittarius:"#100c1e",capricorn:"#141416",aquarius:"#060e18",pisces:"#0c1018",spring:"#f2f8f0",summer:"#fff8f0",autumn:"#1a1410",winter:"#0a0e14",elementary:"#fffef4","middle-school":"#181e24","high-school":"#121418",university:"#f5f0e8"};var s=localStorage.getItem("rmh-style");if(s&&s!=="default"){document.documentElement.classList.add("style-"+s)}var bg=m[s||"default"]||m.default;window.__themeBg=bg;document.documentElement.style.backgroundColor=bg;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content=bg;else{t=document.createElement("meta");t.name="theme-color";t.content=bg;document.head.appendChild(t)}}catch(e){}})()`;

const bodyThemeScript = `if(window.__themeBg)document.body.style.backgroundColor=window.__themeBg`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "RMH | The Everything Platform" },
      { name: "description", content: "RMH - The Everything Platform. Games, apps, research, and more." },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Nunito:wght@200..1000&family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&family=Playfair+Display:wght@400..900&family=Bangers&family=Bebas+Neue&family=Orbitron:wght@400..900&family=Cinzel:wght@400..900&family=Pacifico&family=Space+Grotesk:wght@300..700&family=Permanent+Marker&family=Caveat:wght@400..700&family=Dancing+Script:wght@400..700&family=Patrick+Hand&display=swap",
      },
    ],
    scripts: [
      { children: themeScript },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className="font-nunito antialiased"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: bodyThemeScript }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <Providers>
      <TwemojiProvider tag="div">
        <Outlet />
      </TwemojiProvider>
    </Providers>
  );
}
