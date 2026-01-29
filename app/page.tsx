import { HeroSection } from "@/components/homepage/HeroSection";
import { ProjectsSection } from "@/components/homepage/ProjectsSection";
import { AboutSection } from "@/components/homepage/AboutSection";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { MerchSection } from "@/components/homepage/MerchSection";
import { FooterSection } from "@/components/homepage/FooterSection";
import { ParticleField } from "@/components/effects/ParticleField";
import { GlobalSmartScroll } from "@/components/ui/GlobalSmartScroll";

export default function Home() {
  return (
    <main className="min-h-screen bg-background noise">
      {/* Interactive particle background */}
      <ParticleField />

      <HeroSection />
      <ProjectsSection />
      <TestimonialsSection />
      <AboutSection />
      <MerchSection />
      <FooterSection />
      <GlobalSmartScroll />
    </main>
  );
}
