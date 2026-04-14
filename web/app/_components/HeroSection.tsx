"use client";

// ---------------------------------------------------------------------------
// HeroSection — Pacifica Intelligence Layer hero
// Technique: dither-base + colour-overlay reveal on mouse hover.
// Ported directly from: github.com/Mihir2423/ai-code-review-system
//
// Base layer:  dark #0A0A0A with SVG noise grain — feels "dithered"
// Overlay:     warm orange-tinted atmospheric glow — reveals under cursor
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRef } from "react";
import { useCssFallback } from "../../hooks/useCssFallback";

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cssOverlay = useRef<HTMLDivElement>(null);

  const css = useCssFallback(sectionRef, cssOverlay);

  return (
    <div
      ref={sectionRef}
      className="relative h-dvh overflow-hidden"
      onMouseMove={css.onMouseMove}
      onMouseEnter={css.onMouseEnter}
      onMouseLeave={css.onMouseLeave}
    >
      {/* ── Base layer: dark grain / dithered atmosphere ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#0A0A0A",
          backgroundImage: [
            // subtle diagonal dither grain
            "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 3px)",
            // very faint radial vignette
            "radial-gradient(ellipse 120% 80% at 50% 100%, rgba(20,10,5,0.6) 0%, transparent 60%)",
          ].join(", "),
        }}
      />

      {/* ── Overlay: warm tinted version revealed on hover ── */}
      <div
        ref={cssOverlay}
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0,
          background: [
            // orange atmospheric glow at centre
            "radial-gradient(ellipse 80% 55% at 50% 40%, rgba(249,115,22,0.10) 0%, rgba(249,115,22,0.04) 40%, transparent 70%)",
            // warm dark lift
            "radial-gradient(ellipse 100% 70% at 50% 50%, rgba(30,15,5,0.7) 0%, transparent 65%)",
            "#0A0A0A",
          ].join(", "),
        }}
      />

      {/* ── Terminal scanline overlay (subtle CRT feel) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
          zIndex: 1,
        }}
      />

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-5 px-6 text-center pt-16">
        {/* Label */}
        <span className="uppercase text-neutral-400 text-xs font-mono tracking-widest">
          Agent-readable market intelligence
        </span>

        {/* Headline */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-white font-medium text-3xl md:text-4xl max-w-xl leading-tight">
            Markets are 24/7.{" "}
            <span className="text-orange-500">Your intelligence</span> should be too.
          </h1>
          <p className="text-neutral-400 text-sm max-w-sm">
            Every trade teaches the system. Patterns emerge from collective behavior.
            Zero friction, zero manual input.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3 mt-2">
          <Link
            href="/patterns"
            className="text-black bg-orange-500 px-4 py-1.5 text-sm font-medium hover:bg-orange-400 transition-colors"
          >
            View Patterns
          </Link>

          <Link
            href="/snapshot/ETH"
            className="relative hover:bg-orange-900/20 text-white px-3 py-1.5 text-sm font-medium border border-orange-900/40 transition-colors"
          >
            {/* corner brackets */}
            <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500" />
            <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500" />
            <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500" />
            Market Snapshot
          </Link>
        </div>

        {/* Stat strip */}
        <div className="flex items-center gap-8 mt-6 text-xs font-mono text-neutral-500 border-t border-neutral-500/20 pt-6">
          <span>
            <span className="text-orange-500 font-bold text-base mr-1">3</span>
            verified patterns
          </span>
          <span className="w-px h-4 bg-neutral-500/30" />
          <span>
            <span className="text-white font-bold text-base mr-1">80+</span>
            intelligence records
          </span>
          <span className="w-px h-4 bg-neutral-500/30" />
          <span>
            <span className="text-orange-500 font-bold text-base mr-1">72.3%</span>
            top win rate
          </span>
        </div>
      </div>

      {/* ── Bottom fade into page ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent, #0A0A0A)",
          zIndex: 2,
        }}
      />
    </div>
  );
}
