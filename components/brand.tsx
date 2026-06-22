import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5"
      aria-label="Uzoma home"
    >
      <span className="relative grid size-8 place-items-center rounded-lg border border-cyan/30 bg-cyan/10">
        <span className="h-3 w-3 rotate-45 border border-cyan" />
        <span className="absolute size-1 rounded-full bg-gold" />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Uzoma
        </span>
      )}
    </Link>
  );
}
