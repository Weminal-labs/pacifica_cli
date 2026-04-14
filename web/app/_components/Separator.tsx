// Diagonal-stripe separator — exact pattern from the reference design.
export function Separator() {
  return (
    <div
      className="w-full h-24 border-y border-neutral-500/20 bg-[#0A0A0A]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.04) 10px, rgba(255,255,255,0.04) 11px)",
      }}
    />
  );
}
