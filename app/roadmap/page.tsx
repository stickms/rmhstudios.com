import { RoadmapSection } from "@/components/roadmap/RoadmapSection";

export const metadata = {
  title: "Roadmap | RMH Studios",
  description:
    "The road ahead: games, community, immersive tech, and film. See how RMH Studios is building a persistent universe across every medium.",
};

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-site-bg text-site-text">
      <RoadmapSection />
    </main>
  );
}
