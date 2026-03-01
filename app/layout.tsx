import type { Metadata } from "next";
import {
  Nunito, Inter, JetBrains_Mono, Playfair_Display, Bangers,
  Bebas_Neue, Orbitron, Cinzel, Pacifico,
  Space_Grotesk, Permanent_Marker, Caveat, Dancing_Script,
  Patrick_Hand,
} from "next/font/google";
import { Providers } from "@/components/Providers";
import { Shell } from '@/components/site/Shell';
import { TwemojiProvider } from "@/components/ui/TwemojiProvider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const bangers = Bangers({
  variable: "--font-bangers",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
});

const pacifico = Pacifico({
  variable: "--font-pacifico",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const permanentMarker = Permanent_Marker({
  variable: "--font-permanent-marker",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const dancingScript = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RMH | The Everything Platform",
  description: "RMH - The Everything Platform. Games, apps, research, and more.",
};

/**
 * Inline script that applies the persisted theme class to <html> before
 * React hydrates, preventing a flash-of-unstyled-content (FOUC).
 *
 * We deliberately skip app / game routes so their own styling isn't
 * momentarily overridden by a site theme class.
 */
function ThemeScript() {
  // Apply persisted theme class AND set the theme-color meta tag before
  // React hydrates so iOS Safari paints the correct color outside the
  // safe area on the very first frame.
  const script = `(function(){try{var m={default:"#1a1b1e",light:"#f5f5f7",gamer:"#0a0a0a",anime:"#fff5f9",musical:"#0c0e1a",hyperpop:"#120018","comic-book":"#fffde0",cinema:"#0a0a08","gen-z":"#1a1820",boomer:"#f5f0e8",aries:"#1a0a0a",taurus:"#141a10",gemini:"#0e0e22",cancer:"#0c1018",leo:"#140e1e",virgo:"#f4f6f2",libra:"#f8f0f6",scorpio:"#0e0608",sagittarius:"#100c1e",capricorn:"#141416",aquarius:"#060e18",pisces:"#0c1018",spring:"#f2f8f0",summer:"#fff8f0",autumn:"#1a1410",winter:"#0a0e14",elementary:"#fffef4","middle-school":"#181e24","high-school":"#121418",university:"#f5f0e8"};var s=localStorage.getItem("rmh-style");if(s&&s!=="default"){document.documentElement.classList.add("style-"+s)}var bg=m[s||"default"]||m.default;var t=document.querySelector('meta[name="theme-color"]');if(t)t.content=bg;else{t=document.createElement("meta");t.name="theme-color";t.content=bg;document.head.appendChild(t)}}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${nunito.variable} ${inter.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} ${bangers.variable} ${bebasNeue.variable} ${orbitron.variable} ${cinzel.variable} ${pacifico.variable} ${spaceGrotesk.variable} ${permanentMarker.variable} ${caveat.variable} ${dancingScript.variable} ${patrickHand.variable} antialiased`}
      >
        <Providers>
          <TwemojiProvider tag="div">
            <Shell>
              {children}
            </Shell>
          </TwemojiProvider>
        </Providers>
      </body>
    </html>
  );
}
