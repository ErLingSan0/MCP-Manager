import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Label({ className, children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[11px] font-medium tracking-[0.04em] text-muted", className)}
      {...props}
    >
      {children}
    </label>
  );
}

const fieldClass =
  "w-full rounded-md border border-line bg-surface px-3 text-[12.5px] text-ink placeholder:text-muted/70 " +
  "transition-colors focus:border-sage/50 focus:outline-none focus:ring-2 focus:ring-sage/15";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldClass, "resize-none py-2 leading-5 font-mono text-[11.5px]", className)}
      {...props}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("group flex items-center gap-2 text-left", className)}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          checked
            ? "border-sage bg-sage text-white"
            : "border-line-strong bg-surface group-hover:border-sage/60",
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      {label && <span className="text-[12px] text-ink-soft">{label}</span>}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="block">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-4 text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-md border border-line bg-surface-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full rounded-[5px] px-3 text-[12px] font-medium transition-colors",
            value === option.value
              ? "bg-surface text-ink shadow-soft"
              : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
