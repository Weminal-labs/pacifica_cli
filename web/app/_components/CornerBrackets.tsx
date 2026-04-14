// Orange corner bracket decorations — reusable for cards, sections, buttons.
export function CornerBrackets({ color = "orange-500" }: { color?: string }) {
  const cls = `border-${color}`;
  return (
    <>
      <span className={`absolute top-0 left-0 h-2 w-2 border-t border-l ${cls} transition-colors`} />
      <span className={`absolute top-0 right-0 h-2 w-2 border-t border-r ${cls} transition-colors`} />
      <span className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l ${cls} transition-colors`} />
      <span className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${cls} transition-colors`} />
    </>
  );
}
