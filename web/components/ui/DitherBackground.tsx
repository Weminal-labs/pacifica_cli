"use client";

import dynamic from "next/dynamic";

// Three.js / WebGL requires browser globals — disable SSR entirely
const Dither = dynamic(() => import("./Dither"), { ssr: false });

interface DitherBackgroundProps {
  waveColor?: [number, number, number];
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

export function DitherBackground(props: DitherBackgroundProps) {
  return <Dither {...props} />;
}
