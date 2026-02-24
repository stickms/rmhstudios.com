import { HeroSection } from "@/components/homepage/HeroSection";
import { ProjectsSection } from "@/components/homepage/ProjectsSection";
import { AboutSection } from "@/components/homepage/AboutSection";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { MerchSection } from "@/components/homepage/MerchSection";
import { FooterSection } from "@/components/homepage/FooterSection";
import { ParticleField } from "@/components/effects/ParticleField";
import { GlobalSmartScroll } from "@/components/ui/GlobalSmartScroll";
import { BlogSection } from "@/components/homepage/BlogSection";
import { AppsSection } from "@/components/homepage/AppsSection";
import { getAllPosts } from "@/lib/blog";

export default function Home() {
  const posts = getAllPosts(["title", "date", "slug", "description", "image"]).slice(0, 8);

  return (
    <main className="min-h-screen bg-background noise">
      {/* Interactive particle background */}
      <ParticleField />

      <HeroSection />
      <ProjectsSection />
      <AppsSection />
      <AboutSection />
      <TestimonialsSection />
      <BlogSection posts={posts} />
      <MerchSection />
      <FooterSection />
      <GlobalSmartScroll />
    </main>
  );
}
