import { HeroSection } from "@/components/homepage/HeroSection";
import { ProjectsSection } from "@/components/homepage/ProjectsSection";
import { AboutSection } from "@/components/homepage/AboutSection";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { MerchSection } from "@/components/homepage/MerchSection";
import { FooterSection } from "@/components/homepage/FooterSection";
import { BlogSection } from "@/components/homepage/BlogSection";
import { NewsSection } from "@/components/homepage/NewsSection";
import { AppsSection } from "@/components/homepage/AppsSection";
import { getAllPosts } from "@/lib/blog";
import { getAllNewsArticles } from "@/lib/news";

export default function Home() {
  const posts = getAllPosts(["title", "date", "slug", "description", "image"]).slice(0, 8);
  const newsArticles = getAllNewsArticles(["title", "date", "slug", "description", "category", "sourcePublisher", "image"]).slice(0, 6);

  return (
    <main className="min-h-screen bg-site-bg">
      <HeroSection />
      <ProjectsSection />
      <AppsSection />
      <AboutSection />
      <TestimonialsSection />
      <BlogSection posts={posts} />
      <NewsSection articles={newsArticles} />
      <MerchSection />
      <FooterSection />
    </main>
  );
}
