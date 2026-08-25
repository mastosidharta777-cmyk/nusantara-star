type BrandLogoProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, inverse = false, className = "" }: BrandLogoProps) {
  const primary = inverse ? "text-white" : "text-[#171713]";
  const gold = "text-[#c78a2a]";

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Nusantara Star">
        <span className={`font-display text-[1.05rem] font-semibold tracking-[0.05em] ${primary}`}>NUSANTARA</span>
        <span className={`font-display text-[1.05rem] font-semibold tracking-[0.05em] ${gold}`}>STAR</span>
        <svg viewBox="0 0 32 32" aria-hidden="true" className="h-5 w-5 shrink-0 text-[#c78a2a]" fill="currentColor">
          <circle cx="16" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 1.8l2.2 8.1L16 12l-2.2-2.1L16 1.8ZM16 30.2l-2.2-8.1L16 20l2.2 2.1-2.2 8.1ZM1.8 16l8.1-2.2L12 16l-2.1 2.2L1.8 16ZM30.2 16l-8.1 2.2L20 16l2.1-2.2 8.1 2.2ZM5.9 5.9l7.2 4.2-.1 3-3-.1-4.1-7.1ZM26.1 26.1l-7.2-4.2.1-3 3 .1 4.1 7.1ZM26.1 5.9l-4.2 7.2-3-.1.1-3 7.1-4.1ZM5.9 26.1l4.2-7.2 3 .1-.1 3-7.1 4.1Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col ${className}`} aria-label="Nusantara Star — Talent & Entertainment Agency">
      <span className="flex items-end gap-3 leading-none">
        <span className={`font-display text-2xl font-medium tracking-[0.08em] ${primary}`}>NUSANTARA</span>
      </span>
      <span className="mt-1 flex items-center gap-2 leading-none">
        <span className={`font-display text-2xl font-medium tracking-[0.1em] ${gold}`}>STAR</span>
        <svg viewBox="0 0 32 32" aria-hidden="true" className="h-6 w-6 text-[#c78a2a]" fill="currentColor">
          <circle cx="16" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 1.8l2.2 8.1L16 12l-2.2-2.1L16 1.8ZM16 30.2l-2.2-8.1L16 20l2.2 2.1-2.2 8.1ZM1.8 16l8.1-2.2L12 16l-2.1 2.2L1.8 16ZM30.2 16l-8.1 2.2L20 16l2.1-2.2 8.1 2.2ZM5.9 5.9l7.2 4.2-.1 3-3-.1-4.1-7.1ZM26.1 26.1l-7.2-4.2.1-3 3 .1 4.1 7.1ZM26.1 5.9l-4.2 7.2-3-.1.1-3 7.1-4.1ZM5.9 26.1l4.2-7.2 3 .1-.1 3-7.1 4.1Z" />
        </svg>
      </span>
      <span className={`mt-2 text-[0.55rem] uppercase tracking-[0.28em] ${inverse ? "text-white/55" : "text-black/45"}`}>Talent & Entertainment Agency</span>
    </span>
  );
}
