import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * 自绘下拉：用 portal 渲染到 body，避免被父容器裁切，
 * 也避免 macOS 原生 select 弹层的蓝色高亮遮挡内容。
 */
export function Select({ value, options, onChange, ariaLabel, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const placeMenu = () => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 144);
    const height = options.length * 32 + 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const openUp = rect.bottom + 6 + height > window.innerHeight - 8;
    const top = openUp ? rect.top - height - 6 : rect.bottom + 6;

    setMenuStyle({ left, top, width });
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open) placeMenu();
          setOpen((current) => !current);
        }}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#e7ebe8] bg-white pl-3 pr-2.5 text-[12px] font-medium text-ink-soft",
          "transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/20",
          open && "border-sage/45",
          className,
        )}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={menuStyle}
            className="fixed z-[80] rounded-[9px] border border-line bg-white p-1 shadow-panel fade-in-soft"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-8 w-full items-center justify-between gap-3 rounded-[5px] px-2 text-left text-[12px] transition-colors",
                    isSelected
                      ? "bg-sage-soft font-medium text-sage-strong"
                      : "text-ink-soft hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
