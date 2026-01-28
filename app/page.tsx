import { HeroSection } from "@/components/homepage/HeroSection";
import { ProjectsSection } from "@/components/homepage/ProjectsSection";
import { AboutSection } from "@/components/homepage/AboutSection";
import { FooterSection } from "@/components/homepage/FooterSection";
import { ParticleField } from "@/components/effects/ParticleField";

export default function Home() {
  return (
    <main className="min-h-screen bg-background noise">
      {/* Interactive particle background */}
      <ParticleField />

      <HeroSection />
      <ProjectsSection />
      <AboutSection />
      <FooterSection />
    </main>
  );
}
