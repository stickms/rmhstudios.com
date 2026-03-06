import type { Metadata } from "next";
import { RMHCoinsPage } from "@/components/rmhcoins/RMHCoinsPage";

export const metadata: Metadata = {
  title: "RMH Coins | RMH Studios",
  description: "Play Plinko and shop with RMH Coins.",
};

export default function CoinsPage() {
  return <RMHCoinsPage />;
}
