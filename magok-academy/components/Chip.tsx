"use client";

export default function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
        selected ? "border-brand bg-brand text-white" : "border-line bg-white text-ink active:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}
