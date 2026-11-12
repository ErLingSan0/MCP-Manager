import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between gap-6 px-[26px]">
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-semibold tracking-[-0.5px] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-[12px] text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
