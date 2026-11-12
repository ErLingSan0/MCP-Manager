import { useMemo, useState, type ReactNode } from "react";
import {
  Bug,
  Copy,
  FolderOpen,
  Globe,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ServerStatus } from "@/lib/types";
import {
  enabledAgentCount,
  healthOf,
  type HealthState,
  type ServerGroup,
} from "@/lib/servers";
import { removeMcpServer } from "@/lib/tauri";
import { copy } from "@/lib/i18n";
import { cn, copyText, formatMemory, formatUptime, shortenPath } from "@/lib/utils";
import { useLanguageStore } from "@/stores/languageStore";
import { AgentIcon } from "@/components/AgentIcon";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/Switch";

interface ServerInspectorProps {
  group: ServerGroup;
  statuses: ServerStatus[];
  toggling: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onToggle: (agentType: string, enabled: boolean, scope: "global" | "local", cwd?: string) => void;
  onOpenDebug: () => void;
}

const healthTone: Record<HealthState, { dot: "moss" | "amber" | "muted"; tone: "moss" | "amber" | "neutral" }> = {
  running: { dot: "moss", tone: "moss" },
  reachable: { dot: "moss", tone: "moss" },
  unreachable: { dot: "amber", tone: "amber" },
  stopped: { dot: "muted", tone: "neutral" },
  checking: { dot: "muted", tone: "neutral" },
};

export function ServerInspector({
  group,
  statuses,
  toggling,
  onClose,
  onRefresh,
  onToggle,
  onOpenDebug,
}: ServerInspectorProps) {
  const { language } = useLanguageStore();
  const t = copy[language];
  const [showAll, setShowAll] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const health = healthOf(group, statuses);
  const status = statuses.find((item) => item.name === group.name);
  const tone = healthTone[health];
  const enabled = enabledAgentCount(group);
  const totalAgents = new Set(group.bindings.map((binding) => binding.agentType)).size;

  const visibleBindings = useMemo(
    () =>
      showAll
        ? group.bindings
        : group.bindings.filter((binding) => binding.enabled || binding.detected),
    [group.bindings, showAll],
  );

  const enabledBindings = group.bindings.filter((binding) => binding.enabled);

  const scopeLabel =
    group.scopes.length > 1
      ? t.inspector.scopeMixed
      : group.scopes[0] === "local"
        ? t.inspector.scopeLocal
        : t.inspector.scopeGlobal;

  const healthLabel = t.health[health];

  const handleCopy = async (value: string) => {
    if (await copyText(value)) toast.success(t.common.copied);
    else toast.error(t.common.copyFailed);
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      for (const binding of enabledBindings) {
        await removeMcpServer({
          serverName: group.name,
          agents: [binding.agentType],
          scope: binding.scope,
          cwd: binding.cwd ?? null,
        });
      }
      toast.success(
        language === "zh"
          ? `已移除「${group.name}」`
          : `Removed “${group.name}”`,
      );
      setConfirmRemove(false);
      onRefresh();
    } catch (error) {
      toast.error(`${t.inspector.disableFailed}: ${String(error)}`);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col bg-transparent">
      <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-line px-[22px]">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#202725] text-white shadow-soft">
          <Server className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {group.name}
          </h2>
          <p className="mt-[3px] text-[11px] text-muted">
            {t.inspector.title} · {group.transport.toUpperCase()}
          </p>
        </div>
        <Badge tone={tone.tone} className="shrink-0">
          {healthLabel}
        </Badge>
        <IconButton onClick={onClose} aria-label={t.common.close} className="xl:hidden">
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-line px-[22px] py-5">
          <SectionLabel>{t.inspector.status}</SectionLabel>

          <div className="rounded-[10px] border border-line bg-white/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot tone={tone.dot} pulse={health === "running" || health === "reachable"} />
                <span className="text-[12.5px] font-medium text-ink">{healthLabel}</span>
                <Badge tone={tone.tone} mono>
                  {group.transport}
                </Badge>
              </div>
              {status?.statusType === "managed" && status.pid && (
                <span className="font-mono text-[10px] text-muted">PID {status.pid}</span>
              )}
            </div>

            {group.isRemote ? (
              <p className="mt-2 font-mono text-[10.5px] text-muted">
                {status?.detail ?? "—"}
              </p>
            ) : health === "running" && status ? (
              <dl className="mt-3.5 grid grid-cols-3 gap-2">
                <Metric label={t.inspector.uptime} value={formatUptime(status.uptimeSecs)} />
                <Metric label={t.inspector.cpu} value={`${status.cpuUsage.toFixed(1)}%`} />
                <Metric label={t.inspector.memory} value={formatMemory(status.memoryMb)} />
              </dl>
            ) : (
              <p className="mt-2 text-[10.5px] text-muted">{t.debug.startHint}</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              {!group.isRemote && (
                <Button size="sm" variant="secondary" onClick={onOpenDebug}>
                  <Bug className="h-3 w-3" />
                  {t.inspector.openDebug}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onRefresh}>
                <RefreshCw className="h-3 w-3" />
                {t.inspector.recheck}
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-line px-[22px] py-5">
          <SectionLabel>{t.inspector.source}</SectionLabel>

          <div className="group relative rounded-[9px] border border-line bg-white/70 px-3 py-2.5 pr-9">
            <code className="block break-all font-mono text-[11px] leading-5 text-ink-soft">
              {group.source || "—"}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(group.source)}
              title={t.common.copy}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-white hover:text-ink group-hover:opacity-100"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              {group.scopes.length > 0 && group.scopes.every((scope) => scope === "local") ? (
                <FolderOpen className="h-3.5 w-3.5 text-muted" />
              ) : (
                <Globe className="h-3.5 w-3.5 text-muted" />
              )}
              {scopeLabel}
            </div>
            <span className="font-mono text-[10.5px] text-muted">
              {t.servers.countConnections(enabled)}
            </span>
          </div>
        </section>

        <section className="px-[22px] py-5">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel className="mb-0">{t.inspector.agents}</SectionLabel>
            <span className="text-[10.5px] font-medium text-muted">
              {t.inspector.agentsCount(enabled, totalAgents)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mb-2 mt-2.5 text-[11px] font-medium text-sage hover:underline"
          >
            {showAll ? t.inspector.showInstalled : t.inspector.showAll}
          </button>

          <div className="-mx-2">
            {visibleBindings.map((binding) => {
              const key = `${binding.agentType}-${binding.scope}`;
              const busy = toggling === key;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-[52px] items-center gap-[11px] rounded-[7px] border-b border-[#f2f3f0] px-2 py-[9px] transition-colors hover:bg-white/60",
                    !binding.detected && !binding.enabled && "opacity-65",
                  )}
                >
                  <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-line bg-white">
                    <AgentIcon agentType={binding.agentType} size="md" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-ink">
                        {binding.displayName}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                        {binding.scope === "global" ? t.common.global : t.common.project}
                      </span>
                      {!binding.detected && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber/70"
                          title={t.inspector.notDetected}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(binding.configPath)}
                      title={binding.configPath}
                      className="mt-0.5 flex max-w-full items-center gap-1 truncate font-mono text-[10px] text-muted transition-colors hover:text-sage"
                    >
                      <span className="truncate">{shortenPath(binding.configPath)}</span>
                    </button>
                  </div>

                  {busy ? (
                    <Spinner className="mr-2 text-sage" />
                  ) : (
                    <Switch
                      checked={binding.enabled}
                      onCheckedChange={() =>
                        onToggle(binding.agentType, binding.enabled, binding.scope, binding.cwd)
                      }
                      label={binding.displayName}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-line bg-white/60 px-[18px] py-3">
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={enabledBindings.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.inspector.remove}
        </Button>
      </footer>

      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} className="max-w-[460px]">
        <DialogHeader
          title={t.inspector.removeTitle}
          subtitle={
            enabledBindings.length > 0
              ? t.inspector.removeDesc(group.name, enabledBindings.length)
              : t.inspector.removeEmpty
          }
          onClose={() => setConfirmRemove(false)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={removing}>
            {t.common.cancel}
          </Button>
          <Button
            variant="secondary"
            className="border-danger bg-danger text-white hover:bg-[#8f352f] hover:border-[#8f352f]"
            onClick={handleRemove}
            disabled={removing || enabledBindings.length === 0}
          >
            {removing && <Spinner />}
            {t.inspector.removeConfirm}
          </Button>
        </DialogFooter>
      </Dialog>
    </aside>
  );
}

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-2.5 text-[12px] font-medium tracking-normal text-ink-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-[11.5px] text-ink">{value}</dd>
    </div>
  );
}
