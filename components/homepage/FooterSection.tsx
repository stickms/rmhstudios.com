"use client";

import { motion } from "framer-motion";
import { ProximityText } from "@/components/ui/ProximityText";
import { FaTwitter, FaDiscord, FaYoutube, FaReddit } from "react-icons/fa";

const socialLinks = [
  { name: "Twitter", href: "#", icon: FaTwitter },
  { name: "Discord", href: "#", icon: FaDiscord },
  { name: "YouTube", href: "#", icon: FaYoutube },
  { name: "Reddit", href: "https://reddit.com/r/rmhstudios", icon: FaReddit },
];

export function FooterSection() {
  return (
    <footer id="contact" className="relative min-h-screen flex flex-col justify-center px-4 py-20 pb-28 md:pb-20 overflow-hidden pb-safe bg-gradient-to-b from-[var(--neon-blue)]/20 to-black">
      {/* Subtle Divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/50 to-transparent opacity-50" />
      
      <div className="max-w-6xl mx-auto w-full">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black">
            <ProximityText maxScale={1.3} proximity={150}>
              Get In Touch
            </ProximityText>
          </h2>
          <p className="mt-4 text-white/60 text-lg md:text-xl max-w-2xl mx-auto">
            Let&apos;s create something amazing together
          </p>
        </motion.div>

        <div className="flex flex-col items-center gap-12">
          {/* Social links */}
          <div className="flex items-center gap-6">
            {socialLinks.map((link, index) => {
              const IconComponent = link.icon;
              return (
                <motion.a
                  key={link.name}
                  href={link.href}
                  aria-label={link.name}
                  className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-[var(--neon-pink)] hover:shadow-[0_0_20px_var(--neon-pink)] transition-all duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <IconComponent />
                </motion.a>
              );
            })}
          </div>

          {/* Info Row: Logo and Contact */}
          <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-between gap-8 px-4">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <span className="text-2xl font-black">
                <ProximityText maxScale={1.15} proximity={80}>
                  RMH STUDIOS
                </ProximityText>
              </span>
            </motion.div>

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
            <span className="text-white/60">
              <ProximityText maxScale={1.1} proximity={60}>
                RMH Studios
              </ProximityText>
            </span>
            . All rights reserved.
          </p>
        </motion.div>
      </div>

      {/* Back to top button - REMOVED for Global Button */}
    </footer>
  );
}
