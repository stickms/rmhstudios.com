"use client";

import { motion } from "framer-motion";
import { FaTwitter, FaDiscord, FaYoutube, FaReddit } from "react-icons/fa";

const socialLinks = [
  { name: "Twitter", href: "#", icon: FaTwitter },
  { name: "Discord", href: "https://discord.gg/ZdfhdAKVSf", icon: FaDiscord },
  { name: "YouTube", href: "#", icon: FaYoutube },
  { name: "Reddit", href: "https://reddit.com/r/rmhstudios", icon: FaReddit },
];

export function FooterSection() {
  return (
    <footer
      id="contact"
      data-slot="footer"
      className="relative px-4 py-16 pb-28 md:pb-16 overflow-hidden bg-site-bg pb-safe"
    >
      {/* Top divider */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-site-border to-transparent" />

      <div className="max-w-6xl mx-auto w-full">
        {/* Section header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black font-(family-name:--site-font-display) text-site-text">
            Get In Touch
          </h2>
          <p className="mt-4 text-site-text-muted text-lg md:text-xl max-w-2xl mx-auto">
            Let&apos;s create something amazing together
          </p>
        </motion.div>

        <div className="flex flex-col items-center gap-10">
          {/* Social links */}
          <div className="flex items-center gap-4">
            {socialLinks.map((link, index) => {
              const IconComponent = link.icon;
              return (
                <motion.a
                  key={link.name}
                  href={link.href}
                  aria-label={link.name}
                  className="w-12 h-12 rounded-full border border-site-border flex items-center justify-center text-site-text-dim hover:text-site-accent hover:border-site-accent transition-all duration-200"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.08 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <IconComponent />
                </motion.a>
              );
            })}
          </div>

          {/* Info Row: Logo and Contact */}
          <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-between gap-6 px-4">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <span className="text-2xl font-black font-(family-name:--site-font-display) text-site-text">
                RMH <span className="text-site-accent">STUDIOS</span>
              </span>
            </motion.div>

            {/* Contact */}
            <motion.div
              className="text-center md:text-right"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <a
                href="mailto:hello@rmhstudios.com"
                className="text-site-text-muted hover:text-site-accent transition-colors relative group"
              >
                hello@rmhstudios.com
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-site-accent group-hover:w-full transition-all duration-300" />
              </a>
            </motion.div>
          </div>
        </div>

        {/* Copyright */}
        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-site-text-dim text-sm">
            &copy; {new Date().getFullYear()} RMH Studios. All rights reserved.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
