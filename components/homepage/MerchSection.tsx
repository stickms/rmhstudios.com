"use client";

import { motion } from "framer-motion";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const merchItems = [
  {
    id: 1,
    title: "Official Tee",
    price: "$29.99",
    image: "/images/merch-tee.jpg",
  },
  {
    id: 2,
    title: "Dev Mug",
    price: "$19.99",
    image: "/images/merch-mug.jpg",
  },
  {
    id: 3,
    title: "Holo Sticker Pack",
    price: "$9.99",
    image: "/images/merch-stickers.jpg",
  },
];

export function MerchSection() {
  return (
    <section
      id="merch"
      className="min-h-screen relative flex flex-col items-center justify-center py-20 px-4 overflow-hidden bg-site-bg-subtle"
    >
      {/* Subtle top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-site-border to-transparent" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <SectionHeading
          title="Official Merch"
          subtitle="Wear the code. Drink the bugs. Own the noobs."
          className="mb-16"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 justify-items-center">
          {merchItems.map((item, index) => (
            <div key={item.id} className="w-full max-w-sm mx-auto h-full">
              <SurfaceCard delay={index * 0.1} className="h-full">
                <div className="aspect-square bg-site-bg rounded-xl mb-4 relative overflow-hidden group">
                  {/* Image Container */}
                  <div className="w-full h-full relative z-10 transition-transform duration-500 group-hover:scale-105">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      className="object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    />
                  </div>

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-linear-to-t from-site-surface/80 via-transparent to-transparent opacity-60 pointer-events-none" />
                </div>

                <h3 className="text-2xl font-bold text-site-text mb-2">{item.title}</h3>

                <div className="flex justify-between items-end mt-auto">
                  <p className="text-site-accent font-medium text-lg">{item.price}</p>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 rounded-full bg-site-surface-hover flex items-center justify-center hover:bg-site-accent hover:text-white transition-colors text-site-text-muted"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </div>
              </SurfaceCard>
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="flex justify-center"
        >
          <Link href="#">
            <Button variant="accent-outline">Visit Full Store</Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
