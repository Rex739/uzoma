"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { cloneElement, isValidElement, useState } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 disabled:pointer-events-none disabled:opacity-40";
const variants = {
  primary: "bg-cyan px-4 py-2.5 text-[#031015] hover:bg-[#66e6fb]",
  secondary:
    "border border-line bg-[#101823] px-4 py-2.5 text-slate-200 hover:border-slate-600 hover:bg-[#141e2a]",
  ghost: "px-3 py-2 text-slate-400 hover:bg-white/5 hover:text-white",
  gold: "bg-gold px-4 py-2.5 text-[#191203] hover:bg-[#f4c968]",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "min-h-10", lg: "min-h-12 px-5" };

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
}) {
  const styles = cn(base, variants[variant], sizes[size], className);
  if (asChild && isValidElement(children))
    return cloneElement(
      children as React.ReactElement<{ className?: string }>,
      {
        className: cn(
          styles,
          (children.props as { className?: string }).className,
        ),
      },
    );
  return (
    <button className={styles} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: "slate" | "cyan" | "blue" | "amber" | "gold" | "green" | "red";
  className?: string;
}) {
  const tones = {
    slate: "border-slate-700 bg-slate-800/40 text-slate-400",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    blue: "border-blue-400/30 bg-blue-400/10 text-blue-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    gold: "border-gold/20 bg-gold/10 text-gold",
    green: "border-emerald/20 bg-emerald/10 text-emerald",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const accessibleLabel = label.toLowerCase().startsWith("copy")
    ? label
    : `Copy ${label.toLowerCase()}`;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            const input = document.createElement("textarea");
            input.value = value;
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            input.remove();
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        aria-label={accessibleLabel}
      >
        {copied ? (
          <Check className="size-3.5 text-emerald" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? "Copied" : label}
      </Button>
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-lg border border-emerald/25 bg-[#0b1514] px-4 py-3 text-xs font-medium text-emerald shadow-2xl"
        >
          <Check className="size-4" />
          Copied to clipboard
        </div>
      )}
    </>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="surface flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 size-2 rounded-full bg-slate-600" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}
