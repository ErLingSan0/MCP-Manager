import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Github, Info, Languages, Power, Terminal } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import type { RuntimeInfo } from "@/lib/types";
import { detectRuntimes, isTauri } from "@/lib/tauri";
import { APP_VERSION, GITHUB_URL } from "@/lib/branding";
import { copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/languageStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { PageHeader } from "@/components/layout/PageHeader";

export function SettingsPage() {
  const { language, setLanguage } = useLanguageStore();
  const t = copy[language];
  const { autoStart, initAutoStart, toggleAutoStart, loading } = useSettingsStore();
  const [runtimes, setRuntimes] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    initAutoStart();
    detectRuntimes()
      .then(setRuntimes)
      .catch(console.error);
  }, [initAutoStart]);

  const runtimeRows = [
    { name: "Node.js", path: runtimes?.nodejs, desc: t.settings.nodeDesc },
    { name: "npx", path: runtimes?.npx, desc: t.settings.npxDesc },
    { name: "Python", path: runtimes?.python, desc: t.settings.pythonDesc },
    { name: "Bun", path: runtimes?.bun, desc: t.settings.bunDesc },
    { name: "uvx", path: runtimes?.uvx, desc: t.settings.uvxDesc },
  ];

  const openRepo = async () => {
    try {
      if (isTauri()) await open(GITHUB_URL);
      else window.open(GITHUB_URL, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] space-y-4 px-7 py-6">
          {!isTauri() && (
            <div className="rounded-lg border border-amber/20 bg-amber-soft px-3.5 py-2.5 text-[11.5px] leading-5 text-amber">
              {t.settings.previewNotice}
            </div>
          )}

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <SectionHeader icon={Languages} title={t.settings.general} />
            <div className="divide-y divide-line/70">
              <Row
                title={t.settings.language}
                description={t.settings.languageHint}
                control={
                  <Segmented
                    value={language}
                    onChange={setLanguage}
                    options={[
                      { value: "zh", label: "中文" },
                      { value: "en", label: "EN" },
                    ]}
                  />
                }
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <SectionHeader icon={Power} title={t.settings.startup} />
            <div className="divide-y divide-line/70">
              <Row
                title={t.settings.autoStart}
                description={t.settings.autoStartHint}
                control={
                  <Switch
                    checked={autoStart}
                    disabled={loading}
                    onCheckedChange={(checked) => toggleAutoStart(checked)}
                    label={t.settings.autoStart}
                  />
                }
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <SectionHeader icon={Terminal} title={t.settings.runtimes} hint={t.settings.runtimesHint} />
            <div className="divide-y divide-line/70">
              {runtimes === null ? (
                <div className="px-4 py-4 text-[11.5px] text-muted">{t.settings.checking}</div>
              ) : (
                runtimeRows.map((runtime) => (
                  <div key={runtime.name} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-[64px] shrink-0 text-[12px] font-medium text-ink">
                      {runtime.name}
                    </div>
                    <Badge tone={runtime.path ? "moss" : "neutral"}>
                      {runtime.path ? t.settings.installed : t.settings.missing}
                    </Badge>
                    <div className="min-w-0 flex-1 text-right">
                      <div
                        className={cn(
                          "truncate font-mono text-[10.5px]",
                          runtime.path ? "text-ink-soft" : "text-muted/70",
                        )}
                      >
                        {runtime.path ?? "—"}
                      </div>
                      <div className="truncate text-[10px] text-muted/80">{runtime.desc}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <SectionHeader icon={Info} title={t.settings.about} />
            <div className="divide-y divide-line/70">
              <InfoRow label={t.settings.version} value={`v${APP_VERSION}`} />
              <InfoRow
                label={t.settings.github}
                value={
                  <Button variant="secondary" size="sm" onClick={openRepo}>
                    <Github className="h-3.5 w-3.5" />
                    {t.settings.openRepo}
                    <ExternalLink className="h-3 w-3 text-muted" />
                  </Button>
                }
              />
              <InfoRow label={t.settings.supportedAgents} value={t.settings.supportedAgentsValue} />
              <InfoRow label={t.settings.techStack} value="Tauri 2 · React 19 · Tailwind CSS 4" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Info;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface-muted/40 px-4 py-2.5">
      <Icon className="h-3.5 w-3.5 text-sage" strokeWidth={1.8} />
      <h2 className="text-[12px] font-semibold text-ink">{title}</h2>
      {hint && <span className="ml-auto text-[10.5px] text-muted">{hint}</span>}
    </div>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-muted">{description}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-[12px] font-medium text-ink">{value}</span>
    </div>
  );
}
