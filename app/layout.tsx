import type { Metadata } from "next";
import { Nunito, Inter, JetBrains_Mono, Playfair_Display, Bangers } from "next/font/google";
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

export const metadata: Metadata = {
  title: "RMH Studios | Game Development Studio",
  description: "RMH Studios - Crafting Digital Worlds. An indie game development studio with exciting projects in the works.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${nunito.variable} ${inter.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} ${bangers.variable} antialiased`}
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
