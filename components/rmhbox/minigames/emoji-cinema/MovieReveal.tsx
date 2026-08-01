'use client';

import { motion } from 'framer-motion';
import { scaleIn } from '@/lib/motion';
import { useTranslation } from "react-i18next";

interface MovieRevealProps {
  title: string;
}

export default function MovieReveal({ title }: MovieRevealProps) {
  const { t } = useTranslation("c-rmhbox");
  return (
    <motion.div className="flex flex-col items-center gap-3 py-6 duration-700"
      variants={scaleIn}
      initial="initial"
      animate="animate"
    >
      <span className="text-4xl">🎬</span>
      <p className="text-sm uppercase tracking-wider text-(--app-text-muted)">{t("the-movie-was", { defaultValue: "The movie was…" })}</p>
      <h2 className="text-3xl font-extrabold text-(--app-accent) text-center">
        {title}
      </h2>
    </motion.div>
  );
}
