import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-sage text-white border border-sage hover:bg-sage-strong hover:border-sage-strong shadow-soft",
  secondary:
    "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-black/[0.04] hover:text-ink",
  danger:
    "bg-transparent text-danger border border-transparent hover:bg-danger-soft hover:text-danger",
  subtle:
    "bg-surface-muted text-ink-soft border border-transparent hover:bg-[#e9f1ee] hover:text-ink",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-[8px] px-2.5 text-[11.5px]",
  md: "h-9 gap-2 rounded-[9px] px-3.5 text-[12px]",
  icon: "h-8 w-8 justify-center rounded-[9px]",
};

/**
 * 防重复点击：onClick 返回 Promise 时，在它完成前忽略后续点击。
 * 返回 handleClick 和 pending 状态，供 Button / IconButton 复用。
 */
function usePendingClick(onClick?: (event: MouseEvent<HTMLButtonElement>) => void) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pendingRef.current) return;
    const result = onClick?.(event) as unknown;
    if (result instanceof Promise) {
      pendingRef.current = true;
      setPending(true);
      void result.finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
    }
  };

  return { pending, handleClick };
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  onClick,
  disabled,
  ...props
}: ButtonProps) {
  const { pending, handleClick } = usePendingClick(onClick);

  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/25",
        "disabled:pointer-events-none disabled:opacity-45",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      onClick={handleClick}
      disabled={disabled || pending}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  onClick,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending, handleClick } = usePendingClick(onClick);

  return (
    <button
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors",
        "hover:bg-black/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/25",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      onClick={handleClick}
      disabled={disabled || pending}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent",
        className,
      )}
    />
  );
}
