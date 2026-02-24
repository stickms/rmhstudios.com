"use client";

import { motion } from "framer-motion";
import { BouncyCard } from "@/components/ui/BouncyCard";
import { ProximityText } from "@/components/ui/ProximityText";
import { NeonButton } from "@/components/ui/NeonButton";
import { ArrowRight } from "lucide-react";

import Image from "next/image";

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
    <section id="merch" className="min-h-screen relative flex flex-col items-center justify-center py-20 px-4 overflow-hidden bg-linear-to-b from-(--neon-purple)/20 to-(--neon-blue)/20">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-(--neon-blue)/50 to-transparent opacity-50" />
      
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-6xl font-black mb-4 tracking-tighter">
            <ProximityText>Official Merch</ProximityText>
          </h2>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
            Wear the code. Drink the bugs. Stick the glitz.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 justify-items-center">
          {merchItems.map((item, index) => (
            <div key={item.id} className="w-full max-w-sm mx-auto h-full">
                <BouncyCard delay={index * 0.1} className="h-full">
                <div className="aspect-square bg-black/40 rounded-xl mb-4 relative overflow-hidden group">
                    
                    {/* Image Container */}
                    <div className="w-full h-full relative z-10 transition-transform duration-500 group-hover:scale-105">
                        <Image 
                            src={item.image} 
                            alt={item.title} 
                            fill 
                            className="object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                        />
                    </div>

                    {/* Hover Glow Effect */}
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-60 pointer-events-none" />
                    <div className="absolute inset-0 bg-(--neon-cyan)/0 group-hover:bg-(--neon-cyan)/10 transition-colors duration-500 pointer-events-none" />
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{item.title}</h3>

                <div className="flex justify-between items-end mt-auto">
                    <p className="text-(--neon-pink) font-mono text-lg">{item.price}</p>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                        <ArrowRight className="w-5 h-5 text-white" />
                    </motion.button>
                </div>
                </BouncyCard>
            </div>
          ))}
        </div>

        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="flex justify-center"
        >
            <NeonButton href="#">Visit Full Store</NeonButton>
        </motion.div>
      </div>
    </section>
  );
}
