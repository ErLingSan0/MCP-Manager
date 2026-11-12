import { useMemo, useState } from "react";
import { Download, Globe, Package, Search } from "lucide-react";
import { toast } from "sonner";
import type { AgentInfo, RegistryServerEntry, RegistrySearchResult } from "@/lib/types";
import { searchMcpRegistry } from "@/lib/tauri";
import { copy } from "@/lib/i18n";
import { useLanguageStore } from "@/stores/languageStore";
import { useAgentStore } from "@/stores/agentStore";
import { Badge } from "@/components/ui/Badge";
import { Button, Spinner } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { AddServerDialog } from "@/components/servers/AddServerDialog";

const suggestions = [
  { label: "GitHub", query: "github" },
  { label: "PostgreSQL", query: "postgres" },
  { label: "Filesystem", query: "filesystem" },
  { label: "Notion", query: "notion" },
  { label: "Linear", query: "linear" },
];

export function RegistryPage() {
  const { language } = useLanguageStore();
  const t = copy[language];
  const { agents, agentsWithServers, fetchAgentsWithServers } = useAgentStore();

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RegistrySearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [presetTarget, setPresetTarget] = useState("");
  const [presetHeaders, setPresetHeaders] = useState("");
  const [presetEnv, setPresetEnv] = useState("");
  const [presetArgs, setPresetArgs] = useState("");

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
    () => agentsWithServers.filter((agent) => agent.detected).map((agent) => agent.agentType),
    [agentsWithServers],
  );

  const runSearch = async (term: string) => {
    setLoading(true);
    try {
      const response = await searchMcpRegistry(term);
      setResult(response);
      if (response.failedRegistries.length > 0) {
        toast.warning(t.registry.failed(response.failedRegistries.length));
      }
    } catch (error) {
      toast.error(`${t.registry.searchFailed}: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = (entry: RegistryServerEntry) => {
    const remote = entry.remotes?.[0];
    setPresetTarget(remote?.url ?? entry.package?.identifier ?? entry.name);
    setPresetHeaders(
      remote?.headers?.map((header) => `${header.name}: ${header.default ?? ""}`).join("\n") ?? "",
    );
    setPresetEnv(
      entry.package?.environmentVariables
        ? Object.entries(entry.package.environmentVariables)
            .map(([name, definition]) => `${name}=${definition.default ?? ""}`)
            .join("\n")
        : "",
    );
    setPresetArgs(
      [
        ...(entry.package?.runtimeArguments ?? []),
        ...extractArguments(entry.package?.packageArguments),
      ].join("\n"),
    );

    const variables = remote?.variables ? Object.keys(remote.variables) : [];
    if (variables.length > 0) {
      toast.info(t.registry.fillVariables(variables.join(", ")));
    }
    setAddOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t.registry.title} subtitle={t.registry.subtitle} />

      <div className="shrink-0 border-b border-line px-7 py-5">
        <div className="flex max-w-[720px] gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch(query);
              }}
              placeholder={t.registry.placeholder}
              className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-[12.5px] placeholder:text-muted/70 focus:border-sage/50 focus:outline-none focus:ring-2 focus:ring-sage/15"
            />
          </div>
          <Button variant="primary" onClick={() => runSearch(query)} disabled={loading} className="h-10 px-5">
            {loading ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
            {t.common.search}
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
            {t.registry.suggested}
          </span>
          {suggestions.map((item) => (
            <button
              key={item.query}
              type="button"
              onClick={() => {
                setQuery(item.query);
                runSearch(item.query);
              }}
              className="rounded-[5px] border border-line bg-surface px-2 py-[3px] text-[11px] text-ink-soft transition-colors hover:border-sage/30 hover:text-sage"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {result === null ? (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-[380px] text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface shadow-soft">
                <Package className="h-4.5 w-4.5 text-sage" />
              </div>
              <h2 className="mt-4 text-[14px] font-semibold text-ink">{t.registry.initialTitle}</h2>
              <p className="mt-1.5 text-[11.5px] leading-5 text-muted">{t.registry.initialBody}</p>
            </div>
          </div>
        ) : loading && result.entries.length === 0 ? (
          <div className="space-y-2 px-7 py-5">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-[76px] animate-pulse rounded-lg border border-line/70 bg-surface/60"
              />
            ))}
          </div>
        ) : result.entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-[360px] text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
                <Search className="h-4 w-4 text-muted" />
              </div>
              <h2 className="mt-3 text-[13.5px] font-semibold text-ink">{t.registry.emptyTitle}</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-muted">{t.registry.emptyBody}</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="border-b border-line/70 px-7 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
              {t.registry.results(result.entries.length)}
            </div>
            {result.entries.map((entry, index) => {
              const remote = entry.remotes?.[0];
              const pkg = entry.package;
              const transport = remote
                ? remote.type === "sse"
                  ? "sse"
                  : "http"
                : pkg
                  ? "stdio"
                  : "—";

              return (
                <article
                  key={`${entry.name}-${index}`}
                  className="group flex items-start gap-4 border-b border-line/60 px-7 py-4 transition-colors hover:bg-surface/70"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted/70">
                    {remote ? (
                      <Globe className="h-4 w-4 text-sage" />
                    ) : (
                      <Package className="h-4 w-4 text-ink-soft" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-ink">
                        {entry.title ?? entry.name}
                      </h3>
                      <Badge mono tone="neutral">
                        v{entry.version}
                      </Badge>
                      <Badge mono tone={remote ? "sage" : "neutral"}>
                        {transport}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-[760px] text-[11.5px] leading-5 text-muted">
                      {entry.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted/90">
                      {remote ? (
                        <span className="truncate">{remote.url}</span>
                      ) : pkg ? (
                        <span className="truncate">
                          {pkg.registryType}: {pkg.identifier}
                        </span>
                      ) : (
                        <span className="truncate">{entry.name}</span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-1 shrink-0 opacity-90 group-hover:opacity-100"
                    onClick={() => handleInstall(entry)}
                  >
                    <Download className="h-3 w-3" />
                    {t.registry.installAction}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <AddServerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => fetchAgentsWithServers()}
        agents={agentList}
        detectedAgents={detectedAgents}
        initialTarget={presetTarget}
        initialHeaders={presetHeaders}
        initialEnv={presetEnv}
        initialArgs={presetArgs}
      />
    </div>
  );
}

function extractArguments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
