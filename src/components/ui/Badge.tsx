import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "sage" | "moss" | "amber" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-muted text-ink-soft",
  sage: "border-sage/15 bg-sage-soft text-sage-strong",
  moss: "border-moss/15 bg-moss-soft text-moss",
  amber: "border-amber/15 bg-amber-soft text-amber",
  danger: "border-danger/15 bg-danger-soft text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  mono,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[2px] text-[10px] font-medium leading-4",
        mono && "font-mono uppercase tracking-[0.06em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse }: { tone: "moss" | "amber" | "muted" | "sage"; pulse?: boolean }) {
  const color =
    tone === "moss" ? "bg-moss" : tone === "amber" ? "bg-amber" : tone === "sage" ? "bg-sage" : "bg-muted/50";
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", color)} />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}
