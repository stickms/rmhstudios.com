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
  title: "RMH Studios | Game Development Studio",
  description: "RMH Studios - Crafting Digital Worlds. An indie game development studio with exciting projects in the works.",
};

/**
 * Inline script that applies the persisted theme class to <html> before
 * React hydrates, preventing a flash-of-unstyled-content (FOUC).
 *
 * We deliberately skip app / game routes so their own styling isn't
 * momentarily overridden by a site theme class.
 */
function ThemeScript() {
  const script = `(function(){try{var s=localStorage.getItem("rmh-style");if(s&&s!=="default"){document.documentElement.classList.add("style-"+s)}}catch(e){}})()`;
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
