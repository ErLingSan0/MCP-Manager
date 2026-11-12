import { useEffect, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTauri } from "@/lib/tauri";
import { IconButton } from "./Button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "center" | "right";
  labelledBy?: string;
}

/** 在遮罩上按住左键拖动整个窗口 */
function startWindowDrag(event: MouseEvent<HTMLElement>) {
  if (!isTauri() || event.button !== 0 || event.detail !== 1) return;
  event.preventDefault();
  void getCurrentWindow().startDragging();
}

export function Dialog({
  open,
  onClose,
  children,
  className,
  align = "center",
  labelledBy,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="presentation">
      {/* 遮罩不响应点击关闭；但按住它可以拖动窗口，避免弹窗打开时窗口拖不动 */}
      <div
        aria-hidden="true"
        onMouseDown={(event) => startWindowDrag(event)}
        className="absolute inset-0 bg-[#202a2c]/20 backdrop-blur-[2px] fade-in-soft"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-10 flex max-h-[calc(100vh-48px)] w-full flex-col overflow-hidden bg-surface",
          "fade-rise",
          align === "center"
            ? "m-auto max-w-[760px] rounded-xl border border-line shadow-float"
            : "ml-auto h-full max-h-none w-[420px] border-l border-line shadow-panel",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({
  title,
  subtitle,
  onClose,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  id?: string;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-5">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[12px] leading-5 text-muted">{subtitle}</p>}
      </div>
      <IconButton onClick={onClose} aria-label="Close" className="-mr-1 -mt-1">
        <X className="h-4 w-4" />
      </IconButton>
    </header>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-muted/60 px-6 py-4">
      {children}
    </footer>
  );
}

export function Drawer({
  open,
  onClose,
  children,
  className,
}: Omit<DialogProps, "align">) {
  return (
    <Dialog open={open} onClose={onClose} align="right" className={className}>
      {children}
    </Dialog>
  );
}
