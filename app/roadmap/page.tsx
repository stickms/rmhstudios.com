import { RoadmapSection } from "@/components/roadmap/RoadmapSection";
import { ParticleField } from "@/components/effects/ParticleField";

export const metadata = {
  title: "Roadmap | RMH Studios",
  description:
    "The road ahead: games, community, immersive tech, and film. See how RMH Studios is building a persistent universe across every medium.",
};

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-background text-white">
      <ParticleField />
      <RoadmapSection />
    </main>
  );
}
