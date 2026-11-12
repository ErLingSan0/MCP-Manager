import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Plus, RefreshCw, Search, Server, X } from "lucide-react";
import { toast } from "sonner";
import type { AgentInfo } from "@/lib/types";
import { normalizeServerConfig } from "@/lib/serverProbes";
import {
  buildServerGroups,
  enabledAgentCount,
  healthOf,
  installedAgentCount,
  type HealthState,
  type ServerGroup,
} from "@/lib/servers";
import { addMcpServer, removeMcpServer } from "@/lib/tauri";
import { copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agentStore";
import { useServerProcessStore } from "@/stores/serverStore";
import { useLanguageStore } from "@/stores/languageStore";
import { AgentIcon } from "@/components/AgentIcon";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/layout/PageHeader";
import { AddServerDialog } from "@/components/servers/AddServerDialog";
import { DebugDrawer } from "@/components/servers/DebugDrawer";
import { ServerInspector } from "@/components/servers/ServerInspector";

type TransportFilter = "all" | "stdio" | "http" | "sse";
type StatusFilter = "all" | HealthState;
type ScopeFilter = "all" | "global" | "local" | "mixed";

export function ServersPage() {
  const { language } = useLanguageStore();
  const t = copy[language];
  const { agents, agentsWithServers, loading, fetchAgentsWithServers } = useAgentStore();
  const { statuses, refreshStatuses } = useServerProcessStore();

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [transportFilter, setTransportFilter] = useState<TransportFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [presetTarget, setPresetTarget] = useState<string | undefined>();
  const [debugOpen, setDebugOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const groups = useMemo(
    () => buildServerGroups(agentsWithServers, agents),
    [agentsWithServers, agents],
  );

  const probes = useMemo(
    () =>
      groups.map((group) => ({
        name: group.name,
        config: normalizeServerConfig(group.config ?? {}),
      })),
    [groups],
  );

  useEffect(() => {
    if (probes.length === 0) return;
    refreshStatuses(probes);
    const interval = window.setInterval(() => refreshStatuses(probes), 10000);
    return () => window.clearInterval(interval);
  }, [probes, refreshStatuses]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedName(null);
      return;
    }
    if (!selectedName || !groups.some((group) => group.name === selectedName)) {
      setSelectedName(groups[0].name);
    }
  }, [groups, selectedName]);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (transportFilter !== "all" && group.transport !== transportFilter) return false;
      if (statusFilter !== "all" && healthOf(group, statuses) !== statusFilter) return false;
      if (scopeFilter === "mixed" && group.scopes.length < 2) return false;
      if (
        (scopeFilter === "global" || scopeFilter === "local") &&
        !group.scopes.includes(scopeFilter)
      ) {
        return false;
      }
      if (!needle) return true;

      const agentNames = group.bindings
        .filter((binding) => binding.enabled)
        .map((binding) => binding.displayName)
        .join(" ")
        .toLowerCase();

      return (
        group.name.toLowerCase().includes(needle) ||
        group.source.toLowerCase().includes(needle) ||
        group.transport.includes(needle) ||
        agentNames.includes(needle)
      );
    });
  }, [groups, query, transportFilter, statusFilter, scopeFilter, statuses]);

  const selectedGroup =
    filteredGroups.find((group) => group.name === selectedName) ??
    groups.find((group) => group.name === selectedName) ??
    null;

  const totalConnections = groups.reduce((sum, group) => sum + enabledAgentCount(group), 0);

  const agentList: AgentInfo[] = useMemo(() => {
    const source = agents.length > 0 ? agents : agentsWithServers;
    return source.map((agent) => ({
      agentType: agent.agentType,
      displayName: agent.displayName,
      supportsProject: agent.supportsProject,
      supportedTransports:
        "supportedTransports" in agent ? agent.supportedTransports : [],
      configPath: agent.configPath,
      localConfigPath: agent.localConfigPath,
    }));
  }, [agents, agentsWithServers]);

  const detectedAgents = useMemo(
    () =>
      agentsWithServers
        .filter((agent) => agent.detected)
        .map((agent) => agent.agentType),
    [agentsWithServers],
  );

  const refreshAll = () => {
    fetchAgentsWithServers();
    if (probes.length > 0) refreshStatuses(probes);
  };

  const handleToggle = async (
    group: ServerGroup,
    agentType: string,
    currentlyEnabled: boolean,
    scope: "global" | "local",
    cwd?: string,
  ) => {
    setToggling(`${agentType}-${scope}`);
    try {
      if (currentlyEnabled) {
        await removeMcpServer({
          serverName: group.name,
          agents: [agentType],
          scope,
          cwd: cwd ?? null,
        });
      } else {
        if (!group.config) {
          toast.error(t.inspector.noSource);
          return;
        }
        const config = group.config;
        await addMcpServer({
          target: group.isRemote
            ? group.source
            : ((config.command as string | undefined) ?? ""),
          serverName: group.name,
          agents: [agentType],
          scope: "global",
          cwd: null,
          transport: group.isRemote
            ? group.transport === "sse"
              ? "sse"
              : "http"
            : undefined,
          headers: group.isRemote
            ? ((config.headers as Record<string, string> | undefined) ?? null)
            : null,
          env: !group.isRemote
            ? ((config.env as Record<string, string> | undefined) ?? null)
            : null,
          args: !group.isRemote ? ((config.args as string[] | undefined) ?? null) : null,
          timeout: null,
          oauthScopes: null,
          autoApproveTools: null,
        });
      }
      await fetchAgentsWithServers();
    } catch (error) {
      toast.error(
        `${currentlyEnabled ? t.inspector.disableFailed : t.inspector.enableFailed}: ${String(error)}`,
      );
    } finally {
      setToggling(null);
    }
  };

  const openAdd = (target?: string) => {
    setPresetTarget(target);
    setAddOpen(true);
  };

  const clearFilters = () => {
    setQuery("");
    setTransportFilter("all");
    setStatusFilter("all");
    setScopeFilter("all");
  };

  const filtersActive =
    query.trim() !== "" ||
    transportFilter !== "all" ||
    statusFilter !== "all" ||
    scopeFilter !== "all";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t.servers.title}
        subtitle={`${t.servers.countServers(groups.length)} · ${t.servers.countConnections(totalConnections)}`}
        actions={
          <>
            <Button variant="secondary" size="md" onClick={refreshAll}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {t.common.refresh}
            </Button>
            <Button variant="primary" size="md" onClick={() => openAdd()}>
              <Plus className="h-3.5 w-3.5" />
              {t.common.addServer}
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-[26px] py-3">
            <div className="relative w-full max-w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.servers.searchPlaceholder}
                className="h-[39px] w-full rounded-[9px] border border-[#e5eae7] bg-white pl-9 pr-8 text-[12px] placeholder:text-muted/70 transition-colors focus:border-sage focus:outline-none focus:ring-[3px] focus:ring-sage/10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Select
                ariaLabel={t.servers.colTransport}
                value={transportFilter}
                onChange={(value) => setTransportFilter(value as TransportFilter)}
                options={[
                  { value: "all", label: t.servers.allTransports },
                  { value: "stdio", label: "stdio" },
                  { value: "http", label: "http" },
                  { value: "sse", label: "sse" },
                ]}
              />
              <Select
                ariaLabel={t.servers.colHealth}
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={[
                  { value: "all", label: t.servers.allStatuses },
                  { value: "running", label: t.health.running },
                  { value: "reachable", label: t.health.reachable },
                  { value: "unreachable", label: t.health.unreachable },
                  { value: "stopped", label: t.health.stopped },
                ]}
              />
              <Select
                ariaLabel={t.servers.colAgents}
                value={scopeFilter}
                onChange={(value) => setScopeFilter(value as ScopeFilter)}
                options={[
                  { value: "all", label: t.servers.allScopes },
                  { value: "global", label: t.common.global },
                  { value: "local", label: t.common.project },
                  { value: "mixed", label: t.common.mixed },
                ]}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <EmptyState onAdd={() => openAdd()} onExample={openAdd} />
            ) : filteredGroups.length === 0 ? (
              <div className="flex h-full items-center justify-center px-8">
                <div className="max-w-[360px] text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
                    <Search className="h-4 w-4 text-muted" />
                  </div>
                  <h2 className="mt-3 text-[13.5px] font-semibold text-ink">
                    {t.servers.noMatchTitle}
                  </h2>
                  <p className="mt-1 text-[11.5px] leading-5 text-muted">{t.servers.noMatchBody}</p>
                  {filtersActive && (
                    <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>
                      {t.servers.clearFilters}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col />
                  <col className="w-[76px]" />
                  <col className="w-[145px]" />
                  <col className="w-[100px]" />
                  <col className="w-9" />
                </colgroup>
                <tbody>
                  {filteredGroups.map((group) => {
                    const active = selectedGroup?.name === group.name;
                    const health = healthOf(group, statuses);
                    const enabledAgents = group.bindings.filter((binding) => binding.enabled);
                    const icons = Array.from(
                      new Map(enabledAgents.map((binding) => [binding.agentType, binding])).values(),
                    );
                    const orphaned = enabledAgents.filter((binding) => !binding.detected).length;

                    return (
                      <tr
                        key={group.name}
                        onClick={() => {
                          setSelectedName(group.name);
                          setInspectorOpen(true);
                        }}
                        className={cn(
                          "group h-[63px] cursor-pointer border-b border-line/60 transition-colors",
                          active
                            ? "bg-[#eaf8f5] shadow-[inset_3px_0_0_0_var(--color-sage)]"
                            : "hover:bg-[#e8f7f3]/50",
                        )}
                      >
                        <td className="py-2 pl-[22px] pr-4">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-ink">
                              {group.name}
                            </div>
                            <div className="mt-[5px] truncate font-mono text-[11px] text-[#92908a]">
                              {group.source || "—"}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="inline-flex rounded-[6px] border border-[#e5e5df] bg-[#f8f7f3] px-2 py-1 text-[10px] text-[#6e706d]">
                            {group.transport}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          {icons.length === 0 ? (
                            <span className="text-[11px] text-muted">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center">
                                {icons.slice(0, 4).map((binding, index) => (
                                  <span
                                    key={binding.agentType}
                                    className={cn(
                                      "flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-surface shadow-[0_0_0_1px_rgba(0,0,0,0.03)]",
                                      index > 0 && "-ml-1.5",
                                    )}
                                    title={binding.displayName}
                                  >
                                    <AgentIcon agentType={binding.agentType} size="xs" />
                                  </span>
                                ))}
                              </div>
                              <span className="text-[11px] text-ink-soft">
                                {icons.length > 4
                                  ? t.servers.agentsMore(icons.length - 4)
                                  : `${installedAgentCount(group)}/${enabledAgentCount(group)}`}
                              </span>
                              {orphaned > 0 && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-amber/70"
                                  title={t.servers.orphaned}
                                />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <HealthLabel health={health} />
                        </td>
                        <td className="py-2 pr-5 text-right">
                          <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-sage opacity-0 transition-opacity group-hover:opacity-100" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {selectedGroup ? (
          <>
            <aside
              className={cn(
                "z-40 h-full w-[390px] shrink-0 border-l border-line bg-[rgba(255,255,255,0.82)] backdrop-blur-xl",
                "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-panel",
                inspectorOpen ? "flex" : "hidden xl:flex",
              )}
            >
              <ServerInspector
                group={selectedGroup}
                statuses={statuses}
                toggling={toggling}
                onClose={() => setInspectorOpen(false)}
                onRefresh={refreshAll}
                onToggle={(agentType, enabled, scope, cwd) =>
                  handleToggle(selectedGroup, agentType, enabled, scope, cwd)
                }
                onOpenDebug={() => setDebugOpen(true)}
              />
            </aside>
            {inspectorOpen && (
              <button
                aria-label={t.common.close}
                onClick={() => setInspectorOpen(false)}
                className="fixed inset-0 z-30 cursor-default bg-[#202a2c]/20 backdrop-blur-[1px] xl:hidden"
              />
            )}
          </>
        ) : (
          <aside className="hidden w-[390px] shrink-0 flex-col items-center justify-center border-l border-line bg-[rgba(255,255,255,0.82)] px-8 text-center backdrop-blur-xl xl:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-muted">
              <Server className="h-4 w-4 text-muted" />
            </div>
            <h2 className="mt-3 text-[13px] font-semibold text-ink">
              {t.inspector.noSelectionTitle}
            </h2>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              {t.inspector.noSelectionBody}
            </p>
          </aside>
        )}
      </div>

      <AddServerDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setPresetTarget(undefined);
        }}
        onSuccess={refreshAll}
        agents={agentList}
        detectedAgents={detectedAgents}
        initialTarget={presetTarget}
      />

      {selectedGroup && (
        <DebugDrawer
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
          group={selectedGroup}
          statuses={statuses}
          onRefresh={refreshAll}
        />
      )}
    </div>
  );
}

function HealthLabel({ health }: { health: HealthState }) {
  const { language } = useLanguageStore();
  const t = copy[language];

  const config: Record<HealthState, { dot: "moss" | "amber" | "muted"; text: string }> = {
    running: { dot: "moss", text: t.health.running },
    reachable: { dot: "moss", text: t.health.reachable },
    unreachable: { dot: "amber", text: t.health.unreachable },
    stopped: { dot: "muted", text: t.health.stopped },
    checking: { dot: "muted", text: t.health.checking },
  };
  const item = config[health];

  return (
    <div className="flex items-center gap-[7px]">
      <StatusDot tone={item.dot} pulse={health === "running"} />
      <span
        className={cn(
          "text-[11px]",
          health === "unreachable" ? "text-amber" : health === "running" || health === "reachable" ? "text-ink-soft" : "text-muted",
        )}
      >
        {item.text}
      </span>
    </div>
  );
}

function EmptyState({
  onAdd,
  onExample,
}: {
  onAdd: () => void;
  onExample: (target: string) => void;
}) {
  const { language } = useLanguageStore();
  const t = copy[language];
  const examples = [
    "https://mcp.example.com/mcp",
    "@modelcontextprotocol/server-filesystem",
    "npx -y some-mcp-server",
  ];

  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="w-full max-w-[430px] text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface shadow-soft">
          <Server className="h-5 w-5 text-sage" />
        </div>
        <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
          {t.servers.emptyTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-[380px] text-[11.5px] leading-[1.7] text-muted">
          {t.servers.emptyBody}
        </p>
        <Button variant="primary" className="mt-5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          {t.servers.addFirst}
        </Button>

        <div className="mt-8">
          <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t.servers.emptyExamplesLabel}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onExample(example)}
                className="max-w-full truncate rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[10.5px] text-ink-soft transition-colors hover:border-sage/30 hover:text-sage"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
