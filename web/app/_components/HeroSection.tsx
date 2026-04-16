"use client";

// ---------------------------------------------------------------------------
// HeroSection — Pacifica Intelligence Layer hero
//
// Two-layer reveal technique (ported from github.com/Mihir2423/ai-code-review-system):
//   Layer 1 (base)    — hero-dither.png: B&W halftone landscape, always visible
//   Layer 2 (overlay) — hero.png: full-color version, opacity:0 by default
//   useCssFallback    — on hover, lerps opacity to 1 + applies a radial mask-image
//                       that follows the mouse so color is revealed like a spotlight
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRef } from "react";
import { useCssFallback } from "../../hooks/useCssFallback";
import { DitherBackground } from "../../components/ui/DitherBackground";

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
      {/* ── Layer 1: B&W dithered landscape (always visible base) ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-dither.png')", zIndex: 1 }}
      />

      {/* ── Layer 2: Dither animated waves — screen-blends over black sky ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          mixBlendMode: "screen",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 62%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 62%)",
        }}
      >
        <DitherBackground
          waveColor={[0.4745098039215686, 0.4745098039215686, 0.4745098039215686]}
          colorNum={5}
          pixelSize={3}
          waveAmplitude={0.28}
          waveSpeed={0.03}
          waveFrequency={2.5}
          enableMouseInteraction={true}
          mouseRadius={1.1}
        />
      </div>

      {/* ── Layer 3: full-color landscape (revealed on hover via mask) ── */}
      <div
        ref={cssOverlay}
        className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: "url('/hero.png')", opacity: 0, zIndex: 3 }}
      />

      {/* ── CRT scanlines — subtle terminal feel ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
          zIndex: 4,
        }}
      />

      {/* ── Content ── */}
      <div
        className="relative z-10 p-6 flex flex-col gap-4 h-full"
      >
        <div className="flex flex-col items-center justify-center pt-32 gap-5 w-full">
          {/* Label */}
          <span className="uppercase text-neutral-400 text-xs font-mono tracking-widest">
            Agent-readable market intelligence
          </span>

          {/* Headline */}
          <div className="flex flex-col items-center justify-center gap-2">
            <h1 className="text-white font-medium text-3xl md:text-4xl max-w-xl text-center leading-tight">
              Markets are 24/7.{" "}
              <span className="text-orange-500">Your intelligence</span>{" "}
              should be too.
            </h1>
            <p className="text-neutral-400 text-sm max-w-sm text-center">
              Every trade teaches the system. Patterns emerge from collective behavior.
              Zero friction, zero manual input.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-3 mt-2">
            <Link
              href="/patterns"
              className="text-black bg-orange-500 px-4 py-1.5 text-sm font-medium hover:bg-orange-400 transition-colors"
            >
              View Patterns
            </Link>

            <Link
              href="/simulate"
              className="relative hover:bg-orange-900/30 text-white px-3 py-1.5 text-sm font-medium border border-orange-900/30 transition-colors"
            >
              <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
              <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
              <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
              <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
              Simulate a Trade
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
      </div>

      {/* ── Bottom fade into page ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, transparent, #0A0A0A)",
          zIndex: 2,
        }}
      />
    </div>
  );
}
