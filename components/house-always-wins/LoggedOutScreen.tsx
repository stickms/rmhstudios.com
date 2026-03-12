"use client";

import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export function LoggedOutScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white relative overflow-hidden">
      {/* Dim ambient vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,black_100%)] pointer-events-none" />

      {/* Subtle noise overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjgiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjYSkiIG9wYWNpdHk9IjEiLz48L3N2Zz4=')]" />

      <motion.div
        className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {/* Decorative line */}
        <div className="w-16 h-px bg-linear-to-r from-transparent via-amber-700/50 to-transparent mb-8" />

        <h1 className="text-4xl font-bold tracking-tight text-amber-100/90 mb-2">
          House Always Wins
        </h1>
        <p className="text-neutral-500 text-sm font-mono tracking-widest uppercase mb-8">
          The table is waiting
        </p>

        <p className="text-neutral-400 text-base leading-relaxed mb-10">
          You need to sign in before you can enter the casino.
          Your debts will be recorded.
        </p>

        <Link
          to="/login"
          search={{ callbackURL: "/house-always-wins" }}
          className="px-8 py-3 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/40 hover:border-amber-600/60 text-amber-200/90 font-semibold rounded-lg transition-all duration-300 tracking-wide"
        >
          Login to Play
        </Link>

        <Link
          to="/builds"
          className="mt-6 flex items-center gap-2 text-neutral-600 hover:text-neutral-400 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back Home
        </Link>

        {/* Decorative line */}
        <div className="w-16 h-px bg-linear-to-r from-transparent via-amber-700/50 to-transparent mt-10" />
      </motion.div>
    </div>
  );
}
