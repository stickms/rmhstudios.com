"use client";

import { motion } from "framer-motion";
import { ProximityText } from "@/components/ui/ProximityText";
import { ScrollButton } from "@/components/ui/ScrollButton";

const socialLinks = [
  { name: "Twitter", href: "#", icon: "X" },
  { name: "Discord", href: "#", icon: "D" },
  { name: "YouTube", href: "#", icon: "Y" },
];

export function FooterSection() {
  return (
    <footer id="contact" className="relative min-h-screen flex flex-col justify-center px-4 py-20">
      <div className="max-w-6xl mx-auto w-full">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black">
            <ProximityText maxScale={1.3} proximity={150}>
              Get In Touch
            </ProximityText>
          </h2>
          <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
            Let&apos;s create something amazing together
          </p>
        </motion.div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <span className="text-2xl font-black">
              <span className="rainbow-text">RMH</span>
              <span className="text-white"> STUDIOS</span>
            </span>
          </motion.div>

          {/* Social links */}
          <div className="flex items-center gap-4">
            {socialLinks.map((link, index) => (
              <motion.a
                key={link.name}
                href={link.href}
                className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-[var(--neon-pink)] hover:shadow-[0_0_20px_var(--neon-pink)] transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{ scale: 1.1, y: -5 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="font-bold">{link.icon}</span>
              </motion.a>
            ))}
          </div>

          {/* Contact */}
          <motion.div
            className="text-center md:text-right"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <a
              href="mailto:hello@rmhstudios.com"
              className="text-white/60 hover:text-white transition-colors relative group"
            >
              hello@rmhstudios.com
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[var(--neon-pink)] to-[var(--neon-cyan)] group-hover:w-full transition-all duration-300" />
            </a>
          </motion.div>
        </div>

        {/* Copyright */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()}{" "}
            <span className="rainbow-text">RMH Studios</span>. All rights
            reserved.
          </p>
        </motion.div>
      </div>

      {/* Back to top button */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
        <ScrollButton targetId="home" label="Back to Top" direction="up" />
      </div>
    </footer>
  );
}
