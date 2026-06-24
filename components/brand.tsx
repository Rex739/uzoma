import Image from "next/image";
import Link from "next/link";

export const UZOMA_BRAND_ASSETS = {
  symbol:
    "https://res.cloudinary.com/dcxghlgre/image/upload/v1782324736/uzoma/logo-removebg-preview_ecp7wm.png",
  wordmark:
    "https://res.cloudinary.com/dcxghlgre/image/upload/v1782324476/uzoma/full-logo-removebg-preview_nuhojg.png",
  appIcon:
    "https://res.cloudinary.com/dcxghlgre/image/upload/v1782324548/uzoma/favicon-removebg-preview_hojf7r.png",
} as const;

function Symbol({ className = "size-12" }: { className?: string }) {
  return (
    <Image
      src={UZOMA_BRAND_ASSETS.symbol}
      alt="Uzoma logo"
      width={500}
      height={500}
      className={`${className} object-contain`}
    />
  );
}

function Wordmark({ className = "block" }: { className?: string }) {
  return (
    <span className={`relative h-10 w-40 ${className}`}>
      <Image
        src={UZOMA_BRAND_ASSETS.wordmark}
        alt="Uzoma"
        width={666}
        height={375}
        className="absolute left-0 top-1/2 h-auto w-40 -translate-y-1/2 object-contain"
      />
    </span>
  );
}

export function Brand({
  compact = false,
  responsive = false,
}: {
  compact?: boolean;
  responsive?: boolean;
}) {
  return (
    <Link
      href="/"
      className="inline-flex shrink-0 items-center"
      aria-label="Uzoma home"
    >
      {responsive ? (
        <>
          <span className="relative block size-8 sm:hidden">
            <Symbol className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2" />
          </span>
          <Wordmark className="hidden sm:block" />
        </>
      ) : compact ? (
        <Symbol />
      ) : (
        <Wordmark />
      )}
    </Link>
  );
}
